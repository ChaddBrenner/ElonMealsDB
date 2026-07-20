import os
import time
from dataclasses import dataclass
from datetime import date, datetime, time as day_time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import pymysql


EASTERN = ZoneInfo("America/New_York")


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
    service_date = str(payload.get("service_date", "")).strip()
    restaurants = payload.get("restaurants")
    if not service_date:
        raise ImporterError("Collected payload is missing service_date")
    if not isinstance(restaurants, list) or not restaurants:
        raise ImporterError("Collected payload has no restaurants; refusing to wipe existing data")
    collected_foods = sum(
        len(as_list(station.get("foods")))
        for restaurant in restaurants
        if isinstance(restaurant, dict)
        for meal in as_list(restaurant.get("meals"))
        if isinstance(meal, dict)
        for station in as_list(meal.get("stations"))
        if isinstance(station, dict)
    )
    if collected_foods == 0:
        raise ImporterError("Collected payload has no foods; refusing to replace existing data")

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
                  restaurants_count, meals_count, foods_count, error_message
                ) VALUES (%s, %s, %s, %s, 'success', %s, %s, %s, NULL)
                """,
                (
                    trim_text(payload.get("source_url"), 500),
                    service_date,
                    started_at,
                    finished_at,
                    int(payload.get("restaurants_count") or inserted["restaurants"]),
                    int(payload.get("meals_count") or inserted["meals"]),
                    int(payload.get("foods_count") or inserted["station_foods"]),
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
    }


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
                  restaurants_count, meals_count, foods_count, error_message
                ) VALUES (%s, %s, %s, %s, 'failed', 0, 0, 0, %s)
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
        INSERT INTO restaurants (name, url, venue_name, service_date)
        VALUES (%s, %s, %s, %s)
        """,
        (
            trim_text(restaurant.get("name"), 120) or "Unknown Restaurant",
            trim_text(restaurant.get("url"), 500),
            trim_text(restaurant.get("venue_name"), 120),
            service_date,
        ),
    )
    return int(cursor.lastrowid)


def insert_meal(cursor: pymysql.cursors.DictCursor, restaurant_id: int, meal: dict[str, Any]) -> int:
    cursor.execute(
        """
        INSERT INTO meals (restaurant_id, name, time_open, time_closed)
        VALUES (%s, %s, %s, %s)
        """,
        (
            restaurant_id,
            trim_text(meal.get("name"), 80) or "Menu",
            service_datetime(meal.get("time_open")),
            service_datetime(meal.get("time_closed")),
        ),
    )
    return int(cursor.lastrowid)


def insert_station(cursor: pymysql.cursors.DictCursor, meal_id: int, station: dict[str, Any]) -> int:
    cursor.execute(
        "INSERT INTO stations (meal_id, name) VALUES (%s, %s)",
        (meal_id, trim_text(station.get("name"), 120) or "Station"),
    )
    return int(cursor.lastrowid)


def upsert_food(cursor: pymysql.cursors.DictCursor, food: dict[str, Any]) -> int:
    external_id = trim_text(food.get("external_id"), 120)
    if not external_id:
        raise ImporterError("Food item is missing external_id")

    values = (
        external_id,
        trim_text(food.get("short_name"), 180) or "Unnamed Food",
        trim_text(food.get("full_name"), 220) or trim_text(food.get("short_name"), 180) or "Unnamed Food",
        trim_text(food.get("description"), 700),
        trim_text(food.get("ingredients"), 65535),
        numeric(food.get("serving_size_amount")),
        trim_text(food.get("serving_size_unit"), 40),
        numeric(food.get("calories")),
        numeric(food.get("calories_from_fat")),
        numeric(food.get("total_fat")),
        numeric(food.get("saturated_fat")),
        numeric(food.get("trans_fat")),
        numeric(food.get("cholesterol")),
        numeric(food.get("sodium")),
        numeric(food.get("total_carbohydrates")),
        numeric(food.get("dietary_fiber")),
        numeric(food.get("sugars")),
        numeric(food.get("protein")),
        bool_value(food.get("vegetarian")),
        bool_value(food.get("vegan")),
        bool_value(food.get("gluten_free")),
        bool_value(food.get("allergy_egg")),
        bool_value(food.get("allergy_shellfish")),
        bool_value(food.get("allergy_soy")),
        bool_value(food.get("allergy_peanut")),
        bool_value(food.get("allergy_wheat")),
        bool_value(food.get("allergy_tree_nut")),
        bool_value(food.get("allergy_milk")),
        bool_value(food.get("allergy_sesame")),
        bool_value(food.get("allergy_fish")),
    )

    cursor.execute(
        """
        INSERT INTO foods (
          external_id, short_name, full_name, description, ingredients, serving_size_amount, serving_size_unit,
          calories, calories_from_fat, total_fat, saturated_fat, trans_fat, cholesterol, sodium,
          total_carbohydrates, dietary_fiber, sugars, protein, vegetarian, vegan, gluten_free,
          allergy_egg, allergy_shellfish, allergy_soy, allergy_peanut, allergy_wheat, allergy_tree_nut,
          allergy_milk, allergy_sesame, allergy_fish
        ) VALUES (
          %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
          %s, %s, %s
        )
        ON DUPLICATE KEY UPDATE
          id = LAST_INSERT_ID(id),
          short_name = VALUES(short_name),
          full_name = VALUES(full_name),
          description = VALUES(description),
          ingredients = VALUES(ingredients),
          serving_size_amount = VALUES(serving_size_amount),
          serving_size_unit = VALUES(serving_size_unit),
          calories = VALUES(calories),
          calories_from_fat = VALUES(calories_from_fat),
          total_fat = VALUES(total_fat),
          saturated_fat = VALUES(saturated_fat),
          trans_fat = VALUES(trans_fat),
          cholesterol = VALUES(cholesterol),
          sodium = VALUES(sodium),
          total_carbohydrates = VALUES(total_carbohydrates),
          dietary_fiber = VALUES(dietary_fiber),
          sugars = VALUES(sugars),
          protein = VALUES(protein),
          vegetarian = VALUES(vegetarian),
          vegan = VALUES(vegan),
          gluten_free = VALUES(gluten_free),
          allergy_egg = VALUES(allergy_egg),
          allergy_shellfish = VALUES(allergy_shellfish),
          allergy_soy = VALUES(allergy_soy),
          allergy_peanut = VALUES(allergy_peanut),
          allergy_wheat = VALUES(allergy_wheat),
          allergy_tree_nut = VALUES(allergy_tree_nut),
          allergy_milk = VALUES(allergy_milk),
          allergy_sesame = VALUES(allergy_sesame),
          allergy_fish = VALUES(allergy_fish)
        """,
        values,
    )
    return int(cursor.lastrowid)


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
