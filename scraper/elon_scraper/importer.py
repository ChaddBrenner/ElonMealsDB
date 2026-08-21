import os
import time
from dataclasses import dataclass
from datetime import date, datetime, time as day_time, timedelta, timezone
from typing import Any
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import pymysql


EASTERN = ZoneInfo("America/New_York")
VERIFIED_SOURCE_CONTRACT_VERSION = 4
ELON_HOSTS = frozenset({"elondining.com", "www.elondining.com"})
SOURCE_KINDS = frozenset({"elon_location", "elon_resource", "external_link", "pdf"})
RESTAURANT_MENU_STATUSES = frozenset({"available", "hours_only", "external", "pdf"})
MEAL_MENU_STATUSES = frozenset({"available", "empty_menu", "hours_only", "not_published", "external", "pdf"})


class ImporterError(RuntimeError):
    """Raised when collected menu data cannot be imported safely."""


@dataclass(frozen=True)
class DbConfig:
    host: str
    port: int
    database: str
    user: str
    password: str

    @classmethod
    def from_env(cls) -> "DbConfig":
        return cls(
            host=os.environ.get("DB_HOST", "127.0.0.1"),
            port=int(os.environ.get("DB_PORT", "3306")),
            database=os.environ.get("DB_NAME", "elon_meals"),
            user=os.environ.get("DB_USER", "elon_scraper"),
            password=os.environ.get("DB_PASSWORD", ""),
        )


def import_menu_payload(payload: dict[str, Any], config: DbConfig | None = None) -> dict[str, Any]:
    validation = validate_menu_payload(payload)
    service_date = validation["service_date"]
    restaurants = validation["restaurants"]

    db_config = config or DbConfig.from_env()
    started_at = utc_naive_now()

    connection = pymysql.connect(
        host=db_config.host,
        port=db_config.port,
        user=db_config.user,
        password=db_config.password,
        database=db_config.database,
        charset="utf8mb4",
        autocommit=False,
        cursorclass=pymysql.cursors.DictCursor,
    )

    inserted = {"restaurants": 0, "meals": 0, "stations": 0, "station_foods": 0}
    touched_food_ids: set[int] = set()

    try:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM restaurants WHERE service_date = %s", (service_date,))

            for restaurant in restaurants:
                restaurant_id = insert_restaurant(cursor, restaurant, service_date)
                inserted["restaurants"] += 1

                for meal in as_list(restaurant.get("meals")):
                    meal_id = insert_meal(cursor, restaurant_id, meal)
                    inserted["meals"] += 1

                    for station in as_list(meal.get("stations")):
                        station_id = insert_station(cursor, meal_id, station)
                        inserted["stations"] += 1

                        for food in as_list(station.get("foods")):
                            food_id = upsert_food(cursor, food)
                            touched_food_ids.add(food_id)
                            cursor.execute(
                                "INSERT IGNORE INTO station_foods (station_id, food_id) VALUES (%s, %s)",
                                (station_id, food_id),
                            )
                            inserted["station_foods"] += cursor.rowcount

            finished_at = utc_naive_now()
            cursor.execute(
                """
                INSERT INTO scraper_runs (
                  source_url, target_date, started_at, finished_at, status,
                  restaurants_count, meals_count, foods_count, distinct_recipes_count,
                  food_variants_count, menu_item_placements_count, error_message
                ) VALUES (%s, %s, %s, %s, 'success', %s, %s, %s, %s, %s, %s, NULL)
                """,
                (
                    trim_text(payload.get("source_url"), 500),
                    service_date,
                    started_at,
                    finished_at,
                    validation["restaurants_count"],
                    validation["meals_count"],
                    validation["foods_count"],
                    validation["distinct_recipes_count"],
                    validation["food_variants_count"],
                    validation["menu_item_placements_count"],
                ),
            )

        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

    return {
        "service_date": service_date,
        **inserted,
        "foods": len(touched_food_ids),
        "distinct_recipes": validation["distinct_recipes_count"],
        "food_variants": validation["food_variants_count"],
        "menu_item_placements": validation["menu_item_placements_count"],
        "hours_only_restaurants": validation["hours_only_restaurants"],
        "warning_count": len(as_list(payload.get("warnings"))),
        "warnings": as_list(payload.get("warnings"))[:10],
        "excluded_resource_count": len(as_list(payload.get("excluded_resources"))),
        "excluded_resources": as_list(payload.get("excluded_resources"))[:10],
    }


def validate_menu_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Validate completeness before a transaction can replace a service date."""
    service_date = str(payload.get("service_date", "")).strip()
    restaurants = payload.get("restaurants")
    if not service_date:
        raise ImporterError("Collected payload is missing service_date")
    try:
        parsed_service_date = date.fromisoformat(service_date)
    except ValueError as exc:
        raise ImporterError("Collected payload has an invalid service_date") from exc
    if not isinstance(restaurants, list) or not restaurants:
        raise ImporterError("Collected payload has no restaurants; refusing to wipe existing data")

    collection_status = str(payload.get("collection_status") or "").strip()
    contract_version = payload.get("source_contract_version")
    verified = collection_status == "complete" and isinstance(contract_version, int) and contract_version >= VERIFIED_SOURCE_CONTRACT_VERSION
    if collection_status and not verified:
        raise ImporterError(
            f"Collected payload is not importable: status={collection_status or 'missing'}, contract={contract_version or 'missing'}"
        )

    counts = {
        "restaurants_count": len(restaurants),
        "meals_count": 0,
        "stations_count": 0,
        "foods_count": 0,
        "distinct_recipes_count": 0,
        "food_variants_count": 0,
        "menu_item_placements_count": 0,
    }
    recipe_ids: set[str] = set()
    food_variants: set[tuple[str, str]] = set()
    empty_meals: list[str] = []
    hours_only_restaurants = 0

    for restaurant in restaurants:
        if not isinstance(restaurant, dict):
            raise ImporterError("Collected payload contains a malformed restaurant")
        restaurant_name = str(restaurant.get("name") or "Unknown Restaurant").strip()
        meals = restaurant.get("meals")
        if not isinstance(meals, list) or not meals:
            raise ImporterError(f"{restaurant_name} has no service-hour records")

        if verified:
            source_kind = str(restaurant.get("source_kind") or "")
            if source_kind not in SOURCE_KINDS:
                raise ImporterError(f"{restaurant_name} has an invalid source_kind: {source_kind or 'missing'}")
            if source_kind == "elon_location" and not is_elon_location_url(restaurant.get("url")):
                raise ImporterError(f"{restaurant_name} has an invalid Elon location URL: {restaurant.get('url')}")
            if not is_http_url(restaurant.get("url")):
                raise ImporterError(f"{restaurant_name} has an invalid resource URL: {restaurant.get('url')}")
            restaurant_status = str(restaurant.get("menu_status") or "")
            if restaurant_status not in RESTAURANT_MENU_STATUSES:
                raise ImporterError(f"{restaurant_name} has an invalid menu_status: {restaurant_status or 'missing'}")
            if restaurant_status == "hours_only":
                hours_only_restaurants += 1

        counts["meals_count"] += len(meals)
        for meal in meals:
            if not isinstance(meal, dict):
                raise ImporterError(f"{restaurant_name} contains a malformed meal")
            meal_name = str(meal.get("name") or "Unnamed Meal").strip()
            opened = parse_service_timestamp(meal.get("time_open"), restaurant_name, meal_name)
            closed = parse_service_timestamp(meal.get("time_closed"), restaurant_name, meal_name)
            if opened.date() != parsed_service_date or closed <= opened or closed - opened > timedelta(days=1):
                raise ImporterError(
                    f"{restaurant_name} / {meal_name} has an invalid service window for {service_date}"
                )

            meal_status = str(meal.get("menu_status") or "")
            if verified:
                if meal_status not in MEAL_MENU_STATUSES:
                    raise ImporterError(
                        f"{restaurant_name} / {meal_name} has an invalid menu_status: {meal_status or 'missing'}"
                    )

            stations = meal.get("stations")
            if not isinstance(stations, list):
                raise ImporterError(f"{restaurant_name} / {meal_name} contains malformed stations")
            counts["stations_count"] += len(stations)
            meal_foods = 0
            for station in stations:
                if not isinstance(station, dict) or not isinstance(station.get("foods"), list):
                    raise ImporterError(f"{restaurant_name} / {meal_name} contains a malformed station")
                for food in station["foods"]:
                    if not isinstance(food, dict) or not str(food.get("external_id") or "").strip():
                        raise ImporterError(f"{restaurant_name} / {meal_name} contains a food without an external_id")
                    external_id = str(food["external_id"]).strip()
                    content_hash = str(food.get("content_hash") or "").strip()
                    if verified and (len(content_hash) != 64 or any(character not in "0123456789abcdef" for character in content_hash.lower())):
                        raise ImporterError(f"{restaurant_name} / {meal_name} contains a food without a valid content_hash")
                    recipe_ids.add(external_id)
                    food_variants.add((external_id, content_hash))
                meal_foods += len(station["foods"])
            counts["foods_count"] += meal_foods
            counts["menu_item_placements_count"] += meal_foods
            if meal_foods == 0:
                empty_meals.append(f"{restaurant_name} / {meal_name}")
            if verified:
                if restaurant_status in {"hours_only", "external", "pdf"} and meal_status != restaurant_status:
                    raise ImporterError(f"{restaurant_name} is {restaurant_status} but {meal_name} is {meal_status}")
                if restaurant_status == "available" and meal_status == "hours_only":
                    raise ImporterError(f"{restaurant_name} has menus but {meal_name} is marked hours_only")
                if meal_status == "available" and meal_foods == 0:
                    raise ImporterError(f"{restaurant_name} / {meal_name} is available but contains no foods")
                if meal_status in {"hours_only", "not_published", "empty_menu", "external", "pdf"} and meal_foods:
                    raise ImporterError(
                        f"{restaurant_name} / {meal_name} is {meal_status} but contains {meal_foods} foods"
                    )

    counts["distinct_recipes_count"] = len(recipe_ids)
    counts["food_variants_count"] = len(food_variants)

    if verified:
        mismatches = [
            f"{key}={payload.get(key)} (computed {value})"
            for key, value in counts.items()
            if payload.get(key) != value
        ]
        if mismatches:
            raise ImporterError(f"Collected payload count mismatch: {', '.join(mismatches)}")
    else:
        if counts["foods_count"] == 0:
            raise ImporterError("Collected payload has no foods; refusing to replace existing data")
        if empty_meals:
            meal_names = ", ".join(empty_meals[:5])
            raise ImporterError(
                f"Collected payload has meals with no foods; refusing to replace existing data: {meal_names}"
            )

    return {
        "service_date": service_date,
        "restaurants": restaurants,
        **counts,
        "hours_only_restaurants": hours_only_restaurants,
    }


def parse_service_timestamp(value: Any, restaurant_name: str, meal_name: str) -> datetime:
    if not value:
        raise ImporterError(f"{restaurant_name} / {meal_name} is missing a service time")
    try:
        return datetime.fromisoformat(str(value))
    except ValueError as exc:
        raise ImporterError(f"{restaurant_name} / {meal_name} has an invalid service time") from exc


def is_elon_location_url(value: Any) -> bool:
    parsed = urlparse(str(value or ""))
    return (
        parsed.scheme.lower() in {"http", "https"}
        and (parsed.hostname or "").lower() in ELON_HOSTS
        and parsed.path.lower().startswith("/locations/")
        and not parsed.path.lower().endswith(".pdf")
    )


def is_http_url(value: Any) -> bool:
    parsed = urlparse(str(value or ""))
    return parsed.scheme.lower() in {"http", "https"} and bool(parsed.hostname)


def record_scraper_failure(
    service_date: date | str,
    error: BaseException,
    config: DbConfig | None = None,
    source_url: str | None = None,
    started_at: datetime | None = None,
) -> dict[str, Any]:
    db_config = config or DbConfig.from_env()
    target_date = service_date.isoformat() if isinstance(service_date, date) else str(service_date)
    summary = build_failure_summary(target_date, error)
    started = started_at or utc_naive_now()
    finished = utc_naive_now()

    connection = pymysql.connect(
        host=db_config.host,
        port=db_config.port,
        user=db_config.user,
        password=db_config.password,
        database=db_config.database,
        charset="utf8mb4",
        autocommit=False,
        cursorclass=pymysql.cursors.DictCursor,
    )

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO scraper_runs (
                  source_url, target_date, started_at, finished_at, status,
                  restaurants_count, meals_count, foods_count, distinct_recipes_count,
                  food_variants_count, menu_item_placements_count, error_message
                ) VALUES (%s, %s, %s, %s, 'failed', 0, 0, 0, 0, 0, 0, %s)
                """,
                (
                    trim_text(source_url, 500) or f"https://www.elondining.com/menu-hours/?date={target_date}",
                    target_date,
                    started,
                    finished,
                    summary["error_message"],
                ),
            )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

    return summary


def build_failure_summary(service_date: str, error: BaseException) -> dict[str, Any]:
    return {
        "service_date": service_date,
        "status": "failed",
        "restaurants": 0,
        "meals": 0,
        "stations": 0,
        "station_foods": 0,
        "foods": 0,
        "error_message": trim_text(error, 500),
    }


def insert_restaurant(cursor: pymysql.cursors.DictCursor, restaurant: dict[str, Any], service_date: str) -> int:
    cursor.execute(
        """
        INSERT INTO restaurants (name, url, venue_name, service_date, source_kind, menu_status)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (
            trim_text(restaurant.get("name"), 120) or "Unknown Restaurant",
            trim_text(restaurant.get("url"), 500),
            trim_text(restaurant.get("venue_name"), 120),
            service_date,
            trim_text(restaurant.get("source_kind"), 32) or "elon_location",
            trim_text(restaurant.get("menu_status"), 32) or "available",
        ),
    )
    return int(cursor.lastrowid)


def insert_meal(cursor: pymysql.cursors.DictCursor, restaurant_id: int, meal: dict[str, Any]) -> int:
    cursor.execute(
        """
        INSERT INTO meals (
          restaurant_id, name, time_open, time_closed, menu_status, menu_label, menu_time_label
        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (
            restaurant_id,
            trim_text(meal.get("name"), 80) or "Menu",
            service_datetime(meal.get("time_open")),
            service_datetime(meal.get("time_closed")),
            trim_text(meal.get("menu_status"), 32) or "available",
            optional_text(meal.get("menu_label"), 160),
            optional_text(meal.get("menu_time_label"), 120),
        ),
    )
    return int(cursor.lastrowid)


def insert_station(cursor: pymysql.cursors.DictCursor, meal_id: int, station: dict[str, Any]) -> int:
    cursor.execute(
        "INSERT INTO stations (meal_id, name, source_id) VALUES (%s, %s, %s)",
        (meal_id, trim_text(station.get("name"), 120) or "Station", optional_text(station.get("source_id"), 120)),
    )
    return int(cursor.lastrowid)


def upsert_food(cursor: pymysql.cursors.DictCursor, food: dict[str, Any]) -> int:
    external_id = trim_text(food.get("external_id"), 120)
    if not external_id:
        raise ImporterError("Food item is missing external_id")
    content_hash = trim_text(food.get("content_hash"), 64)
    if len(content_hash) != 64:
        raise ImporterError(f"Food item {external_id} is missing its content_hash")

    columns = (
        "external_id", "source_recipe_id", "content_hash", "short_name", "full_name", "description",
        "ingredients", "disclaimer", "hide_allergens", "serving_size_amount", "serving_size_unit",
        "calories", "calories_from_fat", "total_fat", "saturated_fat", "trans_fat", "cholesterol",
        "sodium", "total_carbohydrates", "dietary_fiber", "sugars", "added_sugars", "protein",
        "potassium", "calcium", "iron", "vitamin_d", "vegetarian", "vegan", "gluten_free",
        "allergy_egg", "allergy_shellfish", "allergy_soy", "allergy_peanut", "allergy_wheat",
        "allergy_tree_nut", "allergy_milk", "allergy_sesame", "allergy_fish",
    )
    values = (
        external_id,
        optional_text(food.get("source_recipe_id"), 120),
        content_hash,
        trim_text(food.get("short_name"), 180) or "Unnamed Food",
        trim_text(food.get("full_name"), 220) or trim_text(food.get("short_name"), 180) or "Unnamed Food",
        optional_text(food.get("description"), 700),
        optional_text(food.get("ingredients"), 65535),
        optional_text(food.get("disclaimer"), 65535),
        bool(food.get("hide_allergens", False)),
        numeric(food.get("serving_size_amount")),
        trim_text(food.get("serving_size_unit"), 40),
        *(numeric(food.get(field)) for field in (
            "calories", "calories_from_fat", "total_fat", "saturated_fat", "trans_fat", "cholesterol",
            "sodium", "total_carbohydrates", "dietary_fiber", "sugars", "added_sugars", "protein",
            "potassium", "calcium", "iron", "vitamin_d",
        )),
        *(bool_value(food.get(field)) for field in (
            "vegetarian", "vegan", "gluten_free", "allergy_egg", "allergy_shellfish", "allergy_soy",
            "allergy_peanut", "allergy_wheat", "allergy_tree_nut", "allergy_milk", "allergy_sesame", "allergy_fish",
        )),
    )
    placeholders = ", ".join(["%s"] * len(columns))
    updates = ",\n          ".join(
        f"{column} = VALUES({column})" for column in columns if column not in {"external_id", "content_hash"}
    )
    cursor.execute(
        f"""
        INSERT INTO foods ({', '.join(columns)})
        VALUES ({placeholders})
        ON DUPLICATE KEY UPDATE
          id = LAST_INSERT_ID(id),
          {updates}
        """,
        values,
    )
    food_id = int(cursor.lastrowid)
    replace_food_metadata(cursor, food_id, food)
    return food_id


def replace_food_metadata(cursor: pymysql.cursors.DictCursor, food_id: int, food: dict[str, Any]) -> None:
    cursor.execute("DELETE FROM food_nutrition_facts WHERE food_id = %s", (food_id,))
    for position, fact in enumerate(as_list(food.get("nutrition_facts"))):
        if not isinstance(fact, dict) or not trim_text(fact.get("label"), 80):
            continue
        cursor.execute(
            """
            INSERT INTO food_nutrition_facts (
              food_id, position, label, unit, value, percent_daily_value, is_secondary
            ) VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                food_id,
                position,
                trim_text(fact.get("label"), 80),
                trim_text(fact.get("unit"), 20),
                numeric(fact.get("value")),
                numeric(fact.get("percent_daily_value")),
                bool(fact.get("is_secondary", False)),
            ),
        )

    cursor.execute("DELETE FROM food_dietary_attributes WHERE food_id = %s", (food_id,))
    for attribute in as_list(food.get("dietary_attributes")):
        if not isinstance(attribute, dict):
            continue
        name = trim_text(attribute.get("name"), 120)
        key = trim_text(attribute.get("key"), 80) or normalize_attribute_key(name)
        if not key or not name:
            continue
        cursor.execute(
            """
            INSERT INTO food_dietary_attributes (food_id, attribute_key, name)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE name = VALUES(name)
            """,
            (food_id, key, name),
        )


def service_dates(anchor: date | None, days_back: int, days_ahead: int) -> list[date]:
    base = anchor or datetime.now(EASTERN).date()
    return [base + timedelta(days=offset) for offset in range(-days_back, days_ahead + 1)]


def parse_run_times(value: str) -> list[day_time]:
    parsed: list[day_time] = []
    for item in value.split(","):
        text = item.strip()
        if not text:
            continue
        try:
            hour_text, minute_text = text.split(":", 1)
            parsed.append(day_time(hour=int(hour_text), minute=int(minute_text)))
        except (TypeError, ValueError) as exc:
            raise ImporterError("Run times must use HH:MM, separated by commas") from exc
    if not parsed:
        raise ImporterError("At least one scheduled run time is required")
    return sorted(parsed)


def seconds_until_next_run(run_times: list[day_time], now: datetime | None = None) -> float:
    current = now or datetime.now(EASTERN)
    if current.tzinfo is None:
        current = current.replace(tzinfo=EASTERN)

    same_day_candidates = [
        datetime.combine(current.date(), run_time, EASTERN)
        for run_time in run_times
    ]
    candidates = same_day_candidates + [
        candidate + timedelta(days=1)
        for candidate in same_day_candidates
    ]
    next_run = min(candidate for candidate in candidates if candidate > current)
    return max(0.0, (next_run - current).total_seconds())


def sleep_until_next_run(run_times: list[day_time]) -> datetime:
    wait_seconds = seconds_until_next_run(run_times)
    next_run = datetime.now(EASTERN) + timedelta(seconds=wait_seconds)
    print(f"next scheduled import: {next_run.isoformat(timespec='seconds')}", flush=True)
    time.sleep(wait_seconds)
    return next_run


def service_datetime(value: Any) -> str:
    if not value:
        raise ImporterError("Meal is missing service time")
    parsed = datetime.fromisoformat(str(value))
    return parsed.replace(tzinfo=None).strftime("%Y-%m-%d %H:%M:%S")


def utc_naive_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def trim_text(value: Any, max_length: int) -> str:
    text = "" if value is None else str(value)
    return text.strip()[:max_length]


def optional_text(value: Any, max_length: int) -> str | None:
    text = trim_text(value, max_length)
    return text or None


def normalize_attribute_key(value: Any) -> str:
    return "_".join(trim_text(value, 80).lower().split())


def numeric(value: Any) -> float:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def bool_value(value: Any) -> bool | None:
    if value is None or value == "":
        return None
    return bool(value)
