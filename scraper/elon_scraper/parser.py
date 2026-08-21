import base64
import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from fractions import Fraction
from typing import Any
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup, Tag
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


BASE_URL = "https://www.elondining.com"
MENU_HOURS_URL = f"{BASE_URL}/menu-hours/"
ELON_HOSTS = frozenset({"elondining.com", "www.elondining.com"})
EASTERN = ZoneInfo("America/New_York")
SOURCE_CONTRACT_VERSION = 4

FACT_LABELS = {
    "Calories": "calories",
    "Calories from Fat": "calories_from_fat",
    "Total Fat": "total_fat",
    "Saturated Fat": "saturated_fat",
    "Trans Fat": "trans_fat",
    "Cholesterol": "cholesterol",
    "Sodium": "sodium",
    "Total Carbohydrate": "total_carbohydrates",
    "Total Carbohydrates": "total_carbohydrates",
    "Dietary Fiber": "dietary_fiber",
    "Total Sugars": "sugars",
    "Sugars": "sugars",
    "Added Sugars": "added_sugars",
    "Protein": "protein",
    "Potassium": "potassium",
    "Calcium": "calcium",
    "Iron": "iron",
    "Vitamin D": "vitamin_d",
}

ALLERGEN_FLAGS = {
    "egg": "allergy_egg",
    "shellfish": "allergy_shellfish",
    "soy": "allergy_soy",
    "soybean": "allergy_soy",
    "peanut": "allergy_peanut",
    "wheat": "allergy_wheat",
    "tree nuts": "allergy_tree_nut",
    "tree nut": "allergy_tree_nut",
    "milk": "allergy_milk",
    "sesame": "allergy_sesame",
    "fish": "allergy_fish",
}

RETRY_STATUSES = frozenset({408, 425, 429, 500, 502, 503, 504})
HTML_CONTENT_TYPES = frozenset({"text/html", "application/xhtml+xml"})
MEAL_LABEL_PATTERN = re.compile(r"^\s*(.*?)\s*(?:\(([^()]*)\))?\s*$")
POST_ID_PATTERN = re.compile(r"(?:^|\s)postid-(\d+)(?:\s|$)")


class ScraperError(RuntimeError):
    """Raised when Elon Dining markup or network responses cannot be parsed safely."""


class ExcludedResourceError(ScraperError):
    """Raised when an Elon link redirects to an explicitly unsupported resource."""

    def __init__(self, target_url: str, reason: str):
        self.target_url = target_url
        self.reason = reason
        super().__init__(f"Excluded {target_url}: {reason}")


@dataclass(frozen=True)
class HttpDocument:
    url: str
    text: str
    content_type: str
    redirect_chain: tuple[str, ...]


@dataclass
class HttpClient:
    timeout: float = 20.0
    session: requests.Session = field(init=False, repr=False)

    def __post_init__(self) -> None:
        retry = Retry(
            total=3,
            connect=3,
            read=3,
            status=3,
            redirect=0,
            other=0,
            allowed_methods=frozenset({"GET"}),
            status_forcelist=RETRY_STATUSES,
            backoff_factor=0.6,
            respect_retry_after_header=True,
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retry, pool_connections=2, pool_maxsize=4)
        self.session = requests.Session()
        self.session.mount("https://", adapter)
        self.session.headers.update({
            "User-Agent": "ElonMealsDB/3.0 (+https://github.com/ChaddBrenner/ElonMealsDB)",
            "Accept": "text/html,application/xhtml+xml;q=0.9",
            "Accept-Language": "en-US,en;q=0.8",
        })

    def close(self) -> None:
        self.session.close()

    def __enter__(self) -> "HttpClient":
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    def get_document(self, url: str, params: dict[str, str] | None = None) -> HttpDocument:
        """Fetch an Elon HTML document without following a redirect off-site or to a PDF."""
        current_url = url
        current_params = params
        redirect_chain: list[str] = []

        for _redirect in range(6):
            if not is_elon_url(current_url):
                raise ExcludedResourceError(current_url, "external_domain")
            if is_pdf_url(current_url):
                raise ExcludedResourceError(current_url, "pdf")

            response = self.session.get(
                current_url,
                params=current_params,
                timeout=(min(self.timeout, 10.0), self.timeout),
                allow_redirects=False,
            )
            current_params = None

            if response.is_redirect or response.is_permanent_redirect:
                location = response.headers.get("Location")
                if not location:
                    raise ScraperError(f"Redirect from {response.url} did not include a Location header")
                target_url = urljoin(response.url, location)
                if not is_elon_url(target_url):
                    raise ExcludedResourceError(target_url, "redirected_external")
                if is_pdf_url(target_url):
                    raise ExcludedResourceError(target_url, "redirected_pdf")
                redirect_chain.append(target_url)
                current_url = target_url
                continue

            response.raise_for_status()
            content_type = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
            if content_type not in HTML_CONTENT_TYPES:
                reason = "pdf" if content_type == "application/pdf" else f"unsupported_content_type:{content_type or 'missing'}"
                raise ExcludedResourceError(response.url, reason)

            text = response.text
            if len(text.strip()) < 200:
                raise ScraperError(f"Elon Dining returned an unexpectedly small document for {response.url}")

            return HttpDocument(
                url=response.url,
                text=text,
                content_type=content_type,
                redirect_chain=tuple(redirect_chain),
            )

        raise ScraperError(f"Too many redirects while fetching {url}")


def collect_menu(service_date: date, timeout: float = 20.0, max_restaurants: int | None = None) -> dict[str, Any]:
    service_date_text = service_date.isoformat()
    source_url = f"{MENU_HOURS_URL}?date={service_date_text}"
    warnings: list[str] = []

    with HttpClient(timeout=timeout) as client:
        hours_document = client.get_document(MENU_HOURS_URL, params={"date": service_date_text})
        hours_page = parse_menu_hours_page(hours_document.text, expected_date=service_date)
        restaurants = hours_page["restaurants"]
        excluded_resources = list(hours_page["excluded_resources"])

        if max_restaurants is not None:
            if max_restaurants < 1:
                raise ScraperError("max_restaurants must be at least 1")
            restaurants = restaurants[:max_restaurants]

        collected_restaurants: list[dict[str, Any]] = []
        for restaurant in restaurants:
            if restaurant["source_kind"] != "elon_location":
                collected_restaurants.append(restaurant)
                continue

            try:
                location_document = client.get_document(restaurant["url"])
            except ExcludedResourceError as exc:
                retain_link_only_resource(restaurant, exc.target_url, exc.reason, warnings)
                collected_restaurants.append(restaurant)
                continue

            if not is_elon_location_url(location_document.url):
                retain_link_only_resource(restaurant, location_document.url, "redirected_non_location", warnings)
                collected_restaurants.append(restaurant)
                continue

            location_page = parse_location_page(location_document.text, expected_date=service_date)
            attach_location_menu(restaurant, location_page, warnings)
            validate_location_identity(restaurant, location_page)
            collected_restaurants.append(restaurant)

    if not collected_restaurants:
        raise ScraperError("No Elon-owned dining locations were collected; refusing to emit an empty payload")

    meals_count = sum(len(restaurant["meals"]) for restaurant in collected_restaurants)
    stations_count = sum(
        len(meal["stations"])
        for restaurant in collected_restaurants
        for meal in restaurant["meals"]
    )
    food_placements = [
        food
        for restaurant in collected_restaurants
        for meal in restaurant["meals"]
        for station in meal["stations"]
        for food in station["foods"]
    ]
    foods_count = len(food_placements)
    distinct_recipes_count = len({food["external_id"] for food in food_placements})
    food_variants_count = len({(food["external_id"], food["content_hash"]) for food in food_placements})

    payload = {
        "source_contract_version": SOURCE_CONTRACT_VERSION,
        "collection_status": "debug_limited" if max_restaurants is not None else "complete",
        "source_url": source_url,
        "service_date": service_date_text,
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "collection_method": {
            "hours": "server_rendered_attributes",
            "menus": "server_rendered_embedded_json",
        },
        "restaurants_discovered_count": hours_page["restaurants_discovered_count"],
        "restaurants_count": len(collected_restaurants),
        "meals_count": meals_count,
        "stations_count": stations_count,
        "foods_count": foods_count,
        "distinct_recipes_count": distinct_recipes_count,
        "food_variants_count": food_variants_count,
        "menu_item_placements_count": foods_count,
        "warnings": warnings,
        "excluded_resources": excluded_resources,
        "restaurants": collected_restaurants,
    }
    validate_collected_payload(payload)
    return payload


def parse_menu_hours(html: str) -> list[dict[str, Any]]:
    """Compatibility wrapper returning every location with Elon-published hours."""
    return parse_menu_hours_page(html)["restaurants"]


def parse_menu_hours_page(html: str, expected_date: date | None = None) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    restaurants: list[dict[str, Any]] = []
    excluded_resources: list[dict[str, str]] = []
    discovered_count = 0

    date_input = soup.select_one("#full-date")
    source_date = clean_string(date_input.get("value")) if isinstance(date_input, Tag) else ""
    if expected_date is not None and source_date != expected_date.isoformat():
        raise ScraperError(
            f"Menu-hours date mismatch: requested {expected_date.isoformat()}, received {source_date or 'missing'}"
        )

    groups = soup.select(".location-group-wrap")
    if not groups:
        raise ScraperError("Menu-hours document contained no location groups")

    for group in groups:
        venue = text_or_empty(group.select_one(".location-venue-name"))
        for row in group.select(".row.location"):
            link = row.select_one("a.open-now-location-link") or row.select_one("a[href]")
            if not isinstance(link, Tag):
                raise ScraperError("A menu-hours location row did not contain a link")

            discovered_count += 1
            name = link.get_text(" ", strip=True)
            url = urljoin(BASE_URL, str(link.get("href", "")))
            source_kind = classify_resource(url)

            meals = []
            for hour in row.select(".hours"):
                open_epoch = clean_string(hour.get("data-open"))
                close_epoch = clean_string(hour.get("data-close"))
                if not open_epoch or not close_epoch:
                    raise ScraperError(f"{name} contains an hours row without data-open/data-close")

                time_open = epoch_to_eastern(open_epoch)
                time_closed = epoch_to_eastern(close_epoch)
                validate_meal_window(name, time_open, time_closed, expected_date)
                meals.append({
                    "name": clean_string(hour.get("data-name")) or text_or_empty(hour.select_one(".hours-name")) or "Hours",
                    "time_open": time_open,
                    "time_closed": time_closed,
                    "hours_status": row_status(hour),
                    "stations": [],
                })

            if not meals:
                excluded_resources.append({"name": name, "url": url, "reason": "no_service_hours"})
                continue
            if not name:
                raise ScraperError("An Elon-owned location row did not contain a restaurant name")
            if not venue:
                raise ScraperError(f"{name} did not contain a venue name")

            restaurants.append({
                "name": name,
                "url": url,
                "venue_name": venue,
                "source_kind": source_kind,
                "menu_status": resource_menu_status(source_kind),
                "hours_status": row_status(row),
                "meals": meals,
            })
            for meal in meals:
                meal["menu_status"] = resource_menu_status(source_kind)

    duplicate_names = duplicates(restaurant["name"] for restaurant in restaurants)
    duplicate_urls = duplicates(restaurant["url"] for restaurant in restaurants)
    if duplicate_names or duplicate_urls:
        raise ScraperError(
            f"Menu-hours contained duplicate locations: names={duplicate_names or 'none'}, urls={duplicate_urls or 'none'}"
        )
    if not restaurants:
        raise ScraperError("Menu-hours contained no locations with service hours")

    return {
        "source_date": source_date or None,
        "restaurants_discovered_count": discovered_count,
        "excluded_resources": excluded_resources,
        "restaurants": restaurants,
    }


def parse_location_page(html: str, expected_date: date) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    body = soup.body
    body_classes = " ".join(body.get("class", [])) if isinstance(body, Tag) else ""
    wrapper = soup.select_one("#single-location-wrap")
    if not isinstance(wrapper, Tag) or "single-locations" not in body_classes:
        raise ScraperError("Location document did not contain the expected Elon location-page structure")

    date_node = soup.select_one("#date-timestamp")
    date_epoch = clean_string(date_node.get("value")) if isinstance(date_node, Tag) else ""
    if not date_epoch:
        raise ScraperError("Location document did not expose its service-date timestamp")
    try:
        location_date = datetime.fromtimestamp(int(date_epoch), EASTERN).date()
    except (OSError, OverflowError, ValueError) as exc:
        raise ScraperError(f"Invalid location service-date timestamp: {date_epoch}") from exc
    if location_date != expected_date:
        raise ScraperError(
            f"Location date mismatch: requested {expected_date.isoformat()}, received {location_date.isoformat()}"
        )

    name = text_or_empty(soup.select_one("#location-header-content h1"))
    venue = text_or_empty(soup.select_one("#location-header-content .location-header-venue"))
    if not name:
        raise ScraperError("Location document did not contain its location identity")
    # The theme omits a redundant venue heading when the venue and location names are identical.
    venue = venue or name

    post_match = POST_ID_PATTERN.search(f" {body_classes} ")
    canonical = soup.select_one('link[rel="canonical"]')
    canonical_url = clean_string(canonical.get("href")) if isinstance(canonical, Tag) else ""

    menu_root = soup.select_one("#menu-tabs")
    if not isinstance(menu_root, Tag):
        return location_page_result(name, venue, location_date, post_match, canonical_url, "hours_only", [])

    nav_links = menu_root.select(".c-tabs-nav__link")
    content_nodes = direct_tab_contents(menu_root)
    if not nav_links and not content_nodes:
        return location_page_result(name, venue, location_date, post_match, canonical_url, "hours_only", [])
    if len(nav_links) != len(content_nodes):
        raise ScraperError(
            f"{name} menu tab mismatch: {len(nav_links)} labels but {len(content_nodes)} content panels"
        )

    menu_meals: list[dict[str, Any]] = []
    tab_ids: set[int] = set()
    for position, nav in enumerate(nav_links):
        raw_tab_id = clean_string(nav.get("data-tabid"))
        try:
            tab_id = int(raw_tab_id)
        except ValueError as exc:
            raise ScraperError(f"{name} menu label {position + 1} had an invalid data-tabid") from exc
        if tab_id in tab_ids or tab_id < 0 or tab_id >= len(content_nodes):
            raise ScraperError(f"{name} menu contained a duplicate or out-of-range data-tabid: {tab_id}")
        tab_ids.add(tab_id)

        label = nav.get_text(" ", strip=True)
        meal_name, time_label = parse_meal_label(label)
        stations = parse_menu_tab(content_nodes[tab_id], strict=True, context=f"{name} / {meal_name}")
        food_count = sum(len(station["foods"]) for station in stations)
        menu_meals.append({
            "name": meal_name,
            "menu_label": label,
            "menu_time_label": time_label,
            "source_tab_id": tab_id,
            "menu_status": "available" if food_count else "empty_menu",
            "stations": stations,
        })

    duplicate_meals = duplicates(normalize_key(meal["name"]) for meal in menu_meals)
    if duplicate_meals:
        raise ScraperError(f"{name} contained duplicate menu meal labels: {duplicate_meals}")

    return location_page_result(name, venue, location_date, post_match, canonical_url, "available", menu_meals)


def location_page_result(
    name: str,
    venue: str,
    location_date: date,
    post_match: re.Match[str] | None,
    canonical_url: str,
    menu_status: str,
    menu_meals: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "name": name,
        "venue_name": venue,
        "service_date": location_date.isoformat(),
        "source_post_id": int(post_match.group(1)) if post_match else None,
        "canonical_url": canonical_url,
        "menu_status": menu_status,
        "menu_meals": menu_meals,
    }


def parse_location_menu(html: str) -> list[list[dict[str, Any]]]:
    """Compatibility parser for fixtures and callers that only need ordered station lists."""
    soup = BeautifulSoup(html, "html.parser")
    return [parse_menu_tab(tab, strict=False, context="location menu") for tab in soup.select(".c-tab__content")]


def parse_menu_tab(tab: Tag, strict: bool, context: str) -> list[dict[str, Any]]:
    stations: list[dict[str, Any]] = []
    for station_index, station in enumerate(tab.select(".menu-station"), start=1):
        heading = station.select_one("h4")
        name = text_or_empty(heading)
        source_id = clean_string(heading.get("data-id")) if isinstance(heading, Tag) else ""
        foods: list[dict[str, Any]] = []
        for item_index, item in enumerate(station.select(".menu-item-li"), start=1):
            food = parse_food_item(item, strict=strict, context=f"{context} / station {station_index} / item {item_index}")
            if food is not None:
                foods.append(food)
        if strict and not name:
            raise ScraperError(f"{context} contained a menu station without a name")
        if name or foods:
            stations.append({"name": name, "source_id": source_id or None, "foods": foods})
    return stations


def parse_food_item(item: Tag, strict: bool = False, context: str = "menu item") -> dict[str, Any] | None:
    link = item.select_one("a.show-nutrition[data-recipe]")
    if not isinstance(link, Tag):
        if strict:
            raise ScraperError(f"{context} did not contain a recipe identifier")
        return None

    recipe_id = clean_string(link.get("data-recipe"))
    if not recipe_id:
        if strict:
            raise ScraperError(f"{context} contained an empty recipe identifier")
        return None

    nutrition_node = item.select_one(f"#recipe-nutrition-{recipe_id}")
    nutrition = parse_nutrition_json(nutrition_node)
    if strict and not nutrition:
        raise ScraperError(f"{context} / {recipe_id} did not contain embedded nutrition JSON")
    classes = set(link.get("class", []))
    dietary_attributes = parse_dietary_attributes(nutrition)

    food = {
        "external_id": recipe_id,
        "source_recipe_id": decode_recipe_id(recipe_id),
        "short_name": link.get_text(" ", strip=True),
        "full_name": clean_string(nutrition.get("name")) or link.get_text(" ", strip=True),
        "description": clean_string(nutrition.get("description")) or None,
        "ingredients": clean_string(nutrition.get("ingredients_list")) or None,
        "disclaimer": clean_string(nutrition.get("disclaimer")) or None,
        "searchable_terms": clean_string(item.get("data-searchable")),
        "serving_size_amount": None,
        "serving_size_unit": "",
        "dietary_attributes": dietary_attributes,
        "nutrition_facts": normalize_nutrition_facts(nutrition.get("facts")),
        "hide_allergens": bool(nutrition.get("hideAllergens", False)),
        "vegetarian": "prop-vegetarian" in classes or has_preference(nutrition, "vegetarian"),
        "vegan": "prop-vegan" in classes or has_preference(nutrition, "vegan"),
        "gluten_free": "prop-made_without_gluten" in classes or has_preference(nutrition, "made_without_gluten"),
    }

    amount, unit = parse_serving_size(clean_string(nutrition.get("serving_size")))
    food["serving_size_amount"] = amount
    food["serving_size_unit"] = unit

    facts = {value: None for value in FACT_LABELS.values()}
    for fact in food["nutrition_facts"]:
        key = FACT_LABELS.get(fact["label"])
        if key:
            facts[key] = fact["value"]
    food.update(facts)
    food.update(parse_allergens(nutrition, classes))
    food["content_hash"] = food_content_hash(food)
    return food


def parse_nutrition_json(node: Tag | None) -> dict[str, Any]:
    if not isinstance(node, Tag):
        return {}
    text = node.get_text(" ", strip=True)
    if not text:
        return {}
    try:
        value = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ScraperError(f"Unable to parse embedded nutrition JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise ScraperError("Embedded nutrition JSON was not an object")
    return value


def normalize_nutrition_facts(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    normalized = []
    for fact in value:
        if not isinstance(fact, dict):
            continue
        label = clean_string(fact.get("label"))
        if not label:
            continue
        normalized.append({
            "label": label,
            "unit": clean_string(fact.get("unit")),
            "value": optional_float(fact.get("value")),
            "percent_daily_value": optional_float(fact.get("percent_drv")),
            "is_secondary": bool(fact.get("is_secondary", False)),
        })
    return normalized


def parse_dietary_attributes(nutrition: dict[str, Any]) -> list[dict[str, str]]:
    attributes = nutrition.get("attributes")
    if not isinstance(attributes, list):
        attributes = nutrition.get("preferences")
    if not isinstance(attributes, list):
        return []

    normalized = []
    for attribute in attributes:
        if not isinstance(attribute, dict):
            continue
        key = clean_string(attribute.get("icon") or attribute.get("html_attribute"))
        name = clean_string(attribute.get("name")) or key.replace("_", " ").title()
        if key or name:
            normalized.append({"key": key, "name": name})
    return normalized


def parse_serving_size(value: str) -> tuple[float | None, str]:
    match = re.match(r"^\s*(?:(\d+)\s+)?(\d+/\d+|\d+(?:\.\d+)?)\s*(.*)$", value)
    if not match:
        return None, value.strip()
    whole_text, amount_text, unit = match.groups()
    try:
        amount = float(whole_text or 0) + float(Fraction(amount_text))
    except (ValueError, ZeroDivisionError):
        return None, value.strip()
    return amount, unit.strip()


def parse_allergens(nutrition: dict[str, Any], classes: set[str]) -> dict[str, bool | None]:
    default = None if nutrition.get("hideAllergens", False) else False
    flags: dict[str, bool | None] = {column: default for column in ALLERGEN_FLAGS.values()}

    for css_class in classes:
        if not css_class.startswith("allergen-has_"):
            continue
        name = css_class.removeprefix("allergen-has_").replace("_", " ")
        column = ALLERGEN_FLAGS.get(name)
        if column:
            flags[column] = True

    allergens_list = clean_string(nutrition.get("allergens_list"))
    for allergen in [item.strip().lower() for item in allergens_list.split(",") if item.strip()]:
        column = ALLERGEN_FLAGS.get(allergen)
        if column:
            flags[column] = True

    return flags


def has_preference(nutrition: dict[str, Any], html_attribute: str) -> bool:
    for field_name in ("attributes", "preferences"):
        preferences = nutrition.get(field_name, [])
        if not isinstance(preferences, list):
            continue
        for preference in preferences:
            if not isinstance(preference, dict):
                continue
            key = clean_string(preference.get("icon") or preference.get("html_attribute"))
            if key == html_attribute:
                return True
    return False


def attach_location_menu(restaurant: dict[str, Any], location_page: dict[str, Any], warnings: list[str]) -> None:
    restaurant["canonical_url"] = location_page.get("canonical_url") or restaurant["url"]
    restaurant["source_post_id"] = location_page.get("source_post_id")
    restaurant["menu_status"] = location_page["menu_status"]

    if location_page["menu_status"] == "hours_only":
        for meal in restaurant["meals"]:
            meal["menu_status"] = "hours_only"
        warnings.append(f"{restaurant['name']} publishes hours but no structured menu for this date")
        return

    menu_by_name = {normalize_key(meal["name"]): meal for meal in location_page["menu_meals"]}
    matched_names: set[str] = set()
    for meal in restaurant["meals"]:
        key = normalize_key(meal["name"])
        menu_meal = menu_by_name.get(key)
        if menu_meal is None:
            meal["menu_status"] = "not_published"
            warnings.append(f"{restaurant['name']} / {meal['name']} has hours but no matching menu tab")
            continue
        matched_names.add(key)
        meal["menu_status"] = menu_meal["menu_status"]
        meal["menu_label"] = menu_meal["menu_label"]
        meal["menu_time_label"] = menu_meal["menu_time_label"]
        meal["source_tab_id"] = menu_meal["source_tab_id"]
        meal["stations"] = menu_meal["stations"]
        if menu_meal["menu_status"] == "empty_menu":
            warnings.append(f"{restaurant['name']} / {meal['name']} publishes an empty menu tab")

    unmatched = [meal["name"] for meal in location_page["menu_meals"] if normalize_key(meal["name"]) not in matched_names]
    if unmatched:
        raise ScraperError(
            f"{restaurant['name']} exposed menu tabs that do not match its service hours: {', '.join(unmatched)}"
        )


def validate_location_identity(restaurant: dict[str, Any], location_page: dict[str, Any]) -> None:
    if normalize_key(restaurant["name"]) != normalize_key(location_page["name"]):
        raise ScraperError(
            f"Location identity mismatch: hours page named {restaurant['name']}, location page named {location_page['name']}"
        )
    if normalize_key(restaurant["venue_name"]) != normalize_key(location_page["venue_name"]):
        raise ScraperError(
            f"Venue identity mismatch for {restaurant['name']}: {restaurant['venue_name']} != {location_page['venue_name']}"
        )


def validate_collected_payload(payload: dict[str, Any]) -> None:
    restaurants = payload.get("restaurants")
    if not isinstance(restaurants, list) or not restaurants:
        raise ScraperError("Collected payload has no restaurants")

    counts = {
        "restaurants_count": len(restaurants),
        "meals_count": sum(len(restaurant.get("meals", [])) for restaurant in restaurants),
        "stations_count": sum(
            len(meal.get("stations", []))
            for restaurant in restaurants
            for meal in restaurant.get("meals", [])
        ),
        "foods_count": sum(
            len(station.get("foods", []))
            for restaurant in restaurants
            for meal in restaurant.get("meals", [])
            for station in meal.get("stations", [])
        ),
    }
    food_placements = [
        food
        for restaurant in restaurants
        for meal in restaurant.get("meals", [])
        for station in meal.get("stations", [])
        for food in station.get("foods", [])
    ]
    counts.update({
        "distinct_recipes_count": len({food.get("external_id") for food in food_placements}),
        "food_variants_count": len({(food.get("external_id"), food.get("content_hash")) for food in food_placements}),
        "menu_item_placements_count": len(food_placements),
    })
    mismatches = [
        f"{key}={payload.get(key)} (computed {value})"
        for key, value in counts.items()
        if payload.get(key) != value
    ]
    if mismatches:
        raise ScraperError(f"Collected payload count mismatch: {', '.join(mismatches)}")

    for restaurant in restaurants:
        source_kind = restaurant.get("source_kind")
        if source_kind not in {"elon_location", "elon_resource", "external_link", "pdf"}:
            raise ScraperError(f"Unknown restaurant resource type entered the payload: {source_kind}")
        if source_kind == "elon_location" and not is_elon_location_url(str(restaurant.get("url", ""))):
            raise ScraperError(f"Invalid Elon location URL entered the payload: {restaurant.get('url')}")
        if not restaurant.get("meals"):
            raise ScraperError(f"{restaurant.get('name')} has no service-hour records")
        for meal in restaurant["meals"]:
            for station in meal.get("stations", []):
                for food in station.get("foods", []):
                    if not food.get("content_hash"):
                        raise ScraperError(f"{restaurant.get('name')} contains a food without a content hash")


def validate_meal_window(name: str, time_open: str, time_closed: str, expected_date: date | None) -> None:
    opened = datetime.fromisoformat(time_open)
    closed = datetime.fromisoformat(time_closed)
    if expected_date is not None and opened.date() != expected_date:
        raise ScraperError(
            f"{name} service window starts on {opened.date().isoformat()}, expected {expected_date.isoformat()}"
        )
    if closed <= opened or closed - opened > timedelta(days=1):
        raise ScraperError(f"{name} contains an invalid service window: {time_open} to {time_closed}")


def direct_tab_contents(menu_root: Tag) -> list[Tag]:
    contents = []
    for child in menu_root.find_all(recursive=False):
        if not isinstance(child, Tag):
            continue
        if "c-tab" not in set(child.get("class", [])):
            continue
        content = child.select_one(".c-tab__content")
        if isinstance(content, Tag):
            contents.append(content)
    if contents:
        return contents
    return [node for node in menu_root.select(".c-tab__content") if isinstance(node, Tag)]


def parse_meal_label(value: str) -> tuple[str, str]:
    match = MEAL_LABEL_PATTERN.match(value)
    if not match:
        return clean_string(value), ""
    name, time_label = match.groups()
    return clean_string(name) or clean_string(value), clean_string(time_label)


def classify_resource(url: str) -> str:
    if is_pdf_url(url):
        return "pdf"
    if is_elon_location_url(url):
        return "elon_location"
    if is_elon_url(url):
        return "elon_resource"
    return "external_link"


def resource_menu_status(source_kind: str) -> str:
    return {
        "elon_location": "available",
        "elon_resource": "hours_only",
        "external_link": "external",
        "pdf": "pdf",
    }[source_kind]


def retain_link_only_resource(
    restaurant: dict[str, Any],
    target_url: str,
    reason: str,
    warnings: list[str],
) -> None:
    source_kind = classify_resource(target_url)
    menu_status = resource_menu_status(source_kind)
    restaurant["url"] = target_url
    restaurant["source_kind"] = source_kind
    restaurant["menu_status"] = menu_status
    for meal in restaurant["meals"]:
        meal["menu_status"] = menu_status
        meal["stations"] = []
    warnings.append(
        f"{restaurant['name']} retains its Elon-published hours and target link but has no local structured menu ({reason})"
    )


def food_content_hash(food: dict[str, Any]) -> str:
    canonical = {
        key: value
        for key, value in food.items()
        if key not in {"content_hash", "searchable_terms"}
    }
    encoded = json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def is_elon_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme.lower() in {"http", "https"} and (parsed.hostname or "").lower() in ELON_HOSTS


def is_elon_location_url(url: str) -> bool:
    if not is_elon_url(url) or is_pdf_url(url):
        return False
    return urlparse(url).path.lower().startswith("/locations/")


def is_pdf_url(url: str) -> bool:
    return urlparse(url).path.lower().endswith(".pdf")


def decode_recipe_id(value: str) -> str | None:
    try:
        padded = value + "=" * (-len(value) % 4)
        decoded = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
    except (UnicodeDecodeError, ValueError):
        return None
    if decoded.startswith("recipe:"):
        return decoded.removeprefix("recipe:")
    return decoded or None


def row_status(node: Tag) -> str:
    classes = set(node.get("class", []))
    if "open" in classes:
        return "open"
    if "closed" in classes:
        return "closed"
    if "relevant" in classes:
        return "upcoming"
    return "scheduled"


def epoch_to_eastern(value: str) -> str:
    try:
        epoch = int(value)
    except ValueError as exc:
        raise ScraperError(f"Invalid epoch value: {value}") from exc
    return datetime.fromtimestamp(epoch, EASTERN).replace(microsecond=0).isoformat()


def text_or_empty(node: Tag | None) -> str:
    return node.get_text(" ", strip=True) if isinstance(node, Tag) else ""


def clean_string(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def optional_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def normalize_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", clean_string(value).lower())


def duplicates(values: Any) -> list[str]:
    seen: set[str] = set()
    repeated: set[str] = set()
    for raw_value in values:
        value = clean_string(raw_value)
        if value in seen:
            repeated.add(value)
        seen.add(value)
    return sorted(repeated)
