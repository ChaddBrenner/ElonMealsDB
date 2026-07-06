import json
import re
from dataclasses import dataclass
from datetime import date, datetime, timezone
from fractions import Fraction
from typing import Any
from urllib.parse import urljoin
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup, Tag


BASE_URL = "https://www.elondining.com"
MENU_HOURS_URL = f"{BASE_URL}/menu-hours/"
EASTERN = ZoneInfo("America/New_York")

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
    "Protein": "protein",
}

ALLERGEN_FLAGS = {
    "egg": "allergy_egg",
    "shellfish": "allergy_shellfish",
    "soy": "allergy_soy",
    "peanut": "allergy_peanut",
    "wheat": "allergy_wheat",
    "tree nuts": "allergy_tree_nut",
    "tree nut": "allergy_tree_nut",
    "milk": "allergy_milk",
    "sesame": "allergy_sesame",
    "fish": "allergy_fish",
}


class ScraperError(RuntimeError):
    """Raised when Elon Dining markup or network responses cannot be parsed."""


@dataclass(frozen=True)
class HttpClient:
    timeout: float = 20.0

    def get(self, url: str, params: dict[str, str] | None = None) -> str:
        response = requests.get(
            url,
            params=params,
            timeout=self.timeout,
            headers={"User-Agent": "ElonMealsDBPortfolio/2.0 (+https://github.com/ChaddBrenner/ElonMealsDB)"},
        )
        response.raise_for_status()
        return response.text


def collect_menu(service_date: date, timeout: float = 20.0, max_restaurants: int | None = None) -> dict[str, Any]:
    client = HttpClient(timeout=timeout)
    service_date_text = service_date.isoformat()
    source_url = f"{MENU_HOURS_URL}?date={service_date_text}"
    restaurants = parse_menu_hours(client.get(MENU_HOURS_URL, params={"date": service_date_text}))

    if max_restaurants is not None:
        restaurants = restaurants[:max_restaurants]

    for restaurant in restaurants:
        if "/locations/" not in restaurant["url"]:
            continue
        tabs = parse_location_menu(client.get(restaurant["url"]))
        for index, meal in enumerate(restaurant["meals"]):
            meal["stations"] = tabs[index] if index < len(tabs) else []

    meals_count = sum(len(restaurant["meals"]) for restaurant in restaurants)
    foods_count = sum(
        len(station["foods"])
        for restaurant in restaurants
        for meal in restaurant["meals"]
        for station in meal["stations"]
    )

    return {
        "source_url": source_url,
        "service_date": service_date_text,
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "restaurants_count": len(restaurants),
        "meals_count": meals_count,
        "foods_count": foods_count,
        "restaurants": restaurants,
    }


def parse_menu_hours(html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    restaurants: list[dict[str, Any]] = []

    for group in soup.select(".location-group-wrap"):
        venue = text_or_empty(group.select_one(".location-venue-name"))
        for row in group.select(".row.location"):
            link = row.select_one("a.open-now-location-link") or row.select_one("a[href]")
            if not isinstance(link, Tag):
                continue

            meals = []
            for hour in row.select(".hours"):
                open_epoch = hour.get("data-open")
                close_epoch = hour.get("data-close")
                if not open_epoch or not close_epoch:
                    continue
                meals.append({
                    "name": (hour.get("data-name") or text_or_empty(hour.select_one(".hours-name"))).strip(),
                    "time_open": epoch_to_eastern(open_epoch),
                    "time_closed": epoch_to_eastern(close_epoch),
                    "stations": [],
                })

            restaurants.append({
                "name": link.get_text(" ", strip=True),
                "url": urljoin(BASE_URL, str(link.get("href", ""))),
                "venue_name": venue,
                "meals": meals,
            })

    return restaurants


def parse_location_menu(html: str) -> list[list[dict[str, Any]]]:
    soup = BeautifulSoup(html, "html.parser")
    tabs: list[list[dict[str, Any]]] = []

    for tab in soup.select(".c-tab__content"):
        stations = []
        for station in tab.select(".menu-station"):
            name = text_or_empty(station.select_one("h4"))
            foods = [parse_food_item(item) for item in station.select(".menu-item-li")]
            foods = [food for food in foods if food is not None]
            if name or foods:
                stations.append({"name": name, "foods": foods})
        tabs.append(stations)

    return tabs


def parse_food_item(item: Tag) -> dict[str, Any] | None:
    link = item.select_one("a.show-nutrition[data-recipe]")
    if not isinstance(link, Tag):
        return None

    recipe_id = str(link.get("data-recipe", "")).strip()
    if not recipe_id:
        return None

    nutrition_node = item.select_one(f"#recipe-nutrition-{recipe_id}")
    nutrition = parse_nutrition_json(nutrition_node)
    classes = set(link.get("class", []))

    food = {
        "external_id": recipe_id,
        "short_name": link.get_text(" ", strip=True),
        "full_name": clean_string(nutrition.get("name")) or link.get_text(" ", strip=True),
        "description": clean_string(nutrition.get("description")),
        "ingredients": clean_string(nutrition.get("ingredients_list")),
        "searchable_terms": clean_string(item.get("data-searchable")),
        "serving_size_amount": 0.0,
        "serving_size_unit": "",
        "vegetarian": "prop-vegetarian" in classes or has_preference(nutrition, "vegetarian"),
        "vegan": "prop-vegan" in classes or has_preference(nutrition, "vegan"),
        "gluten_free": "prop-made_without_gluten" in classes or has_preference(nutrition, "made_without_gluten"),
    }

    amount, unit = parse_serving_size(clean_string(nutrition.get("serving_size")))
    food["serving_size_amount"] = amount
    food["serving_size_unit"] = unit

    facts = {value: 0.0 for value in FACT_LABELS.values()}
    for fact in nutrition.get("facts", []):
        key = FACT_LABELS.get(clean_string(fact.get("label")))
        if key:
            facts[key] = safe_float(fact.get("value"))
    food.update(facts)

    allergens = parse_allergens(nutrition, classes)
    food.update(allergens)

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
        return {}
    return value


def parse_serving_size(value: str) -> tuple[float, str]:
    match = re.match(r"^\s*([0-9]+(?:\.[0-9]+)?|[0-9]+/[0-9]+)\s*(.*)$", value)
    if not match:
        return 0.0, ""
    amount_text, unit = match.groups()
    try:
        amount = float(Fraction(amount_text))
    except (ValueError, ZeroDivisionError):
        amount = 0.0
    return amount, unit.strip()


def parse_allergens(nutrition: dict[str, Any], classes: set[str]) -> dict[str, bool]:
    flags = {column: False for column in ALLERGEN_FLAGS.values()}

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
    preferences = nutrition.get("preferences", [])
    if not isinstance(preferences, list):
        return False
    return any(preference.get("html_attribute") == html_attribute for preference in preferences if isinstance(preference, dict))


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


def safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0
