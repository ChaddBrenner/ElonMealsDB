"""Reproducible analysis helpers for the production ElonMealsDB history.

The module reads the production MySQL database through the existing ``macmaxi``
SSH alias and the database container's read-only API account.  It never embeds
or prints database credentials.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from io import StringIO
import json
import subprocess

import pandas as pd


REMOTE_HOST = "macmaxi"
REMOTE_PROJECT = "/Users/chaddbrenner/services/elonmealsdb"
LIVE_START = pd.Timestamp("2026-07-08")
AS_OF_DATE = pd.Timestamp("2026-08-20")

REMOTE_MYSQL_COMMAND = (
    f"cd {REMOTE_PROJECT} && "
    "/usr/local/bin/docker compose exec -T mysql sh -lc "
    "'MYSQL_PWD=\"$MYSQL_API_PASSWORD\" mysql -B "
    "--default-character-set=utf8mb4 -u\"$MYSQL_API_USER\" \"$MYSQL_DATABASE\"'"
)


DAILY_SQL = """
SELECT
  DATE_FORMAT(r.service_date, '%Y-%m-%d') AS service_date,
  DAYNAME(r.service_date) AS weekday,
  COUNT(DISTINCT r.id) AS restaurants,
  GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ' | ') AS restaurant_names,
  COUNT(DISTINCT m.id) AS meals,
  COUNT(DISTINCT s.id) AS stations,
  COUNT(sf.food_id) AS appearances,
  COUNT(DISTINCT sf.food_id) AS distinct_foods,
  DATE_FORMAT(MIN(m.time_open), '%H:%i') AS first_open,
  DATE_FORMAT(MAX(m.time_closed), '%H:%i') AS last_close
FROM restaurants r
LEFT JOIN meals m ON m.restaurant_id = r.id
LEFT JOIN stations s ON s.meal_id = m.id
LEFT JOIN station_foods sf ON sf.station_id = s.id
GROUP BY r.service_date
ORDER BY r.service_date
"""


APPEARANCES_SQL = """
SELECT
  DATE_FORMAT(r.service_date, '%Y-%m-%d') AS service_date,
  r.name AS restaurant,
  m.id AS meal_id,
  m.name AS meal,
  DATE_FORMAT(m.time_open, '%Y-%m-%d %H:%i:%s') AS time_open,
  DATE_FORMAT(m.time_closed, '%Y-%m-%d %H:%i:%s') AS time_closed,
  s.id AS station_id,
  s.name AS station,
  f.id AS food_id,
  f.external_id,
  f.short_name,
  f.calories,
  f.protein,
  f.sodium,
  f.total_fat,
  f.total_carbohydrates,
  f.vegetarian,
  f.vegan,
  f.gluten_free,
  f.allergy_egg,
  f.allergy_shellfish,
  f.allergy_soy,
  f.allergy_peanut,
  f.allergy_wheat,
  f.allergy_tree_nut,
  f.allergy_milk,
  f.allergy_sesame,
  f.allergy_fish
FROM restaurants r
JOIN meals m ON m.restaurant_id = r.id
JOIN stations s ON s.meal_id = m.id
JOIN station_foods sf ON sf.station_id = s.id
JOIN foods f ON f.id = sf.food_id
WHERE r.service_date >= '2026-07-08'
ORDER BY r.service_date, r.name, m.time_open, s.name, f.short_name
"""


MEALS_SQL = """
SELECT
  DATE_FORMAT(r.service_date, '%Y-%m-%d') AS service_date,
  r.id AS restaurant_id,
  r.name AS restaurant,
  m.id AS meal_id,
  m.name AS meal,
  DATE_FORMAT(m.time_open, '%Y-%m-%d %H:%i:%s') AS time_open,
  DATE_FORMAT(m.time_closed, '%Y-%m-%d %H:%i:%s') AS time_closed,
  COUNT(DISTINCT s.id) AS stations,
  COUNT(sf.food_id) AS appearances
FROM restaurants r
JOIN meals m ON m.restaurant_id = r.id
LEFT JOIN stations s ON s.meal_id = m.id
LEFT JOIN station_foods sf ON sf.station_id = s.id
WHERE r.service_date >= '2026-07-08'
GROUP BY r.service_date, r.id, r.name, m.id, m.name, m.time_open, m.time_closed
ORDER BY r.service_date, r.name, m.time_open
"""


RUNS_SQL = """
SELECT
  id,
  DATE_FORMAT(target_date, '%Y-%m-%d') AS target_date,
  DATE_FORMAT(started_at, '%Y-%m-%d %H:%i:%s') AS started_at,
  DATE_FORMAT(finished_at, '%Y-%m-%d %H:%i:%s') AS finished_at,
  status,
  restaurants_count,
  meals_count,
  foods_count,
  error_message
FROM scraper_runs
WHERE target_date >= '2026-07-08'
ORDER BY started_at
"""


QUALITY_SQL = """
SELECT
  (SELECT COUNT(*) FROM restaurants r
    WHERE r.service_date >= '2026-07-08'
      AND NOT EXISTS (SELECT 1 FROM meals m WHERE m.restaurant_id = r.id))
      AS restaurants_without_meals,
  (SELECT COUNT(*) FROM meals m JOIN restaurants r ON r.id = m.restaurant_id
    WHERE r.service_date >= '2026-07-08'
      AND NOT EXISTS (SELECT 1 FROM stations s WHERE s.meal_id = m.id))
      AS meals_without_stations,
  (SELECT COUNT(*) FROM stations s JOIN meals m ON m.id = s.meal_id
    JOIN restaurants r ON r.id = m.restaurant_id
    WHERE r.service_date >= '2026-07-08'
      AND NOT EXISTS (SELECT 1 FROM station_foods sf WHERE sf.station_id = s.id))
      AS stations_without_foods,
  (SELECT COUNT(*) FROM meals m JOIN restaurants r ON r.id = m.restaurant_id
    WHERE r.service_date >= '2026-07-08' AND m.time_closed <= m.time_open)
      AS invalid_meal_windows,
  (SELECT COUNT(*) FROM foods) AS total_food_rows,
  (SELECT COUNT(DISTINCT f.id) FROM foods f JOIN station_foods sf ON sf.food_id = f.id)
      AS referenced_food_rows,
  (SELECT COUNT(DISTINCT f.id) FROM foods f JOIN station_foods sf ON sf.food_id = f.id
    WHERE f.calories IS NULL OR f.protein IS NULL OR f.sodium IS NULL
       OR f.vegetarian IS NULL OR f.vegan IS NULL OR f.gluten_free IS NULL)
      AS appeared_foods_missing_core_nutrition,
  (SELECT COUNT(DISTINCT f.id)
    FROM foods f JOIN station_foods sf ON sf.food_id = f.id
    JOIN stations s ON s.id = sf.station_id
    JOIN meals m ON m.id = s.meal_id
    JOIN restaurants r ON r.id = m.restaurant_id
    WHERE r.service_date >= '2026-07-08' AND f.calories = 0)
      AS live_appeared_foods_with_zero_calories,
  (SELECT COUNT(*)
    FROM foods f JOIN station_foods sf ON sf.food_id = f.id
    JOIN stations s ON s.id = sf.station_id
    JOIN meals m ON m.id = s.meal_id
    JOIN restaurants r ON r.id = m.restaurant_id
    WHERE r.service_date >= '2026-07-08' AND f.calories = 0)
      AS live_zero_calorie_appearances,
  (SELECT COUNT(DISTINCT r.service_date)
    FROM foods f JOIN station_foods sf ON sf.food_id = f.id
    JOIN stations s ON s.id = sf.station_id
    JOIN meals m ON m.id = s.meal_id
    JOIN restaurants r ON r.id = m.restaurant_id
    WHERE r.service_date >= '2026-07-08' AND f.calories = 0)
      AS live_dates_with_zero_calorie_items,
  (SELECT COUNT(*) FROM (
    SELECT r.service_date, r.name AS restaurant_name, m.name AS meal_name,
           m.time_open, m.time_closed, COUNT(*) AS row_count
    FROM meals m JOIN restaurants r ON r.id = m.restaurant_id
    WHERE r.service_date >= '2026-07-08'
    GROUP BY r.service_date, r.name, m.name, m.time_open, m.time_closed
    HAVING COUNT(*) > 1
  ) duplicate_meals) AS duplicate_meal_grains,
  (SELECT COUNT(*) FROM (
    SELECT m.id, LOWER(TRIM(s.name)) AS station_name, COUNT(*) AS row_count
    FROM stations s JOIN meals m ON m.id = s.meal_id
    JOIN restaurants r ON r.id = m.restaurant_id
    WHERE r.service_date >= '2026-07-08'
    GROUP BY m.id, LOWER(TRIM(s.name))
    HAVING COUNT(*) > 1
  ) duplicate_stations) AS duplicate_station_grains
"""


@dataclass
class AnalysisBundle:
    daily: pd.DataFrame
    appearances: pd.DataFrame
    meals: pd.DataFrame
    runs: pd.DataFrame
    quality: pd.DataFrame
    summary: dict[str, object]
    recurrence: pd.DataFrame
    similarity: pd.DataFrame
    dietary_daily: pd.DataFrame
    station_rotation: pd.DataFrame
    run_daily: pd.DataFrame


def query_dataframe(sql: str) -> pd.DataFrame:
    """Run a read-only query against production and return a DataFrame."""
    completed = subprocess.run(
        ["ssh", REMOTE_HOST, REMOTE_MYSQL_COMMAND],
        input=sql.strip() + ";\n",
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "Remote MySQL query failed")
    if not completed.stdout.strip():
        return pd.DataFrame()
    return pd.read_csv(StringIO(completed.stdout), sep="\t")


def load_source_data() -> dict[str, pd.DataFrame]:
    frames = {
        "daily": query_dataframe(DAILY_SQL),
        "appearances": query_dataframe(APPEARANCES_SQL),
        "meals": query_dataframe(MEALS_SQL),
        "runs": query_dataframe(RUNS_SQL),
        "quality": query_dataframe(QUALITY_SQL),
    }
    for frame_name in ("daily", "appearances", "meals"):
        frames[frame_name]["service_date"] = pd.to_datetime(frames[frame_name]["service_date"])
    frames["runs"]["target_date"] = pd.to_datetime(frames["runs"]["target_date"])
    frames["runs"]["started_at"] = pd.to_datetime(frames["runs"]["started_at"])
    frames["runs"]["finished_at"] = pd.to_datetime(frames["runs"]["finished_at"])
    frames["meals"]["time_open"] = pd.to_datetime(frames["meals"]["time_open"])
    frames["meals"]["time_closed"] = pd.to_datetime(frames["meals"]["time_closed"])
    frames["appearances"]["time_open"] = pd.to_datetime(frames["appearances"]["time_open"])
    frames["appearances"]["time_closed"] = pd.to_datetime(frames["appearances"]["time_closed"])
    return frames


def meal_period(opened: pd.Timestamp) -> str:
    if opened.hour < 10:
        return "Breakfast"
    if opened.hour < 16:
        return "Lunch"
    return "Dinner"


def build_analysis(frames: dict[str, pd.DataFrame]) -> AnalysisBundle:
    daily = frames["daily"].copy()
    appearances = frames["appearances"].copy()
    meals = frames["meals"].copy()
    runs = frames["runs"].copy()
    quality = frames["quality"].copy()

    live_daily = daily[(daily["service_date"] >= LIVE_START) & (daily["service_date"] <= AS_OF_DATE)].copy()
    valid_daily = live_daily[live_daily["appearances"] > 0].copy()
    expected_dates = pd.date_range(LIVE_START, AS_OF_DATE, freq="D")

    campus_day_foods = appearances[["service_date", "food_id", "short_name"]].drop_duplicates()
    valid_menu_days = campus_day_foods["service_date"].nunique()
    recurrence = (
        campus_day_foods.groupby(["food_id", "short_name"], as_index=False)
        .agg(service_days=("service_date", "nunique"), first_seen=("service_date", "min"), last_seen=("service_date", "max"))
        .sort_values(["service_days", "short_name"], ascending=[False, True])
    )
    recurrence["share_of_valid_days"] = recurrence["service_days"] / max(valid_menu_days, 1)

    date_sets = {
        service_date: set(group["food_id"].astype(int))
        for service_date, group in campus_day_foods.groupby("service_date")
    }
    similarity_rows: list[dict[str, object]] = []
    prior_date: pd.Timestamp | None = None
    seen: set[int] = set()
    for service_date in sorted(date_sets):
        current = date_sets[service_date]
        new_to_history = current - seen
        if prior_date is None:
            prior = set()
            jaccard = float("nan")
            added = len(current)
            removed = 0
        else:
            prior = date_sets[prior_date]
            union = current | prior
            jaccard = len(current & prior) / len(union) if union else float("nan")
            added = len(current - prior)
            removed = len(prior - current)
        similarity_rows.append(
            {
                "service_date": service_date,
                "previous_valid_date": prior_date,
                "distinct_foods": len(current),
                "jaccard_vs_previous": jaccard,
                "menu_turnover_vs_previous": 1 - jaccard if pd.notna(jaccard) else float("nan"),
                "added_vs_previous": added,
                "removed_vs_previous": removed,
                "first_seen_in_history": len(new_to_history),
            }
        )
        seen |= current
        prior_date = service_date
    similarity = pd.DataFrame(similarity_rows)

    allergen_columns = [
        "allergy_egg", "allergy_shellfish", "allergy_soy", "allergy_peanut",
        "allergy_wheat", "allergy_tree_nut", "allergy_milk", "allergy_sesame", "allergy_fish",
    ]
    diet_source = appearances.drop_duplicates(["service_date", "food_id"]).copy()
    diet_source["no_top9"] = (diet_source[allergen_columns].fillna(1).astype(int).sum(axis=1) == 0)
    dietary_daily = (
        diet_source.groupby("service_date", as_index=False)
        .agg(
            total_items=("food_id", "nunique"),
            vegetarian_items=("vegetarian", "sum"),
            vegan_items=("vegan", "sum"),
            gluten_free_items=("gluten_free", "sum"),
            no_top9_items=("no_top9", "sum"),
        )
    )
    for key in ("vegetarian", "vegan", "gluten_free", "no_top9"):
        dietary_daily[f"{key}_share"] = dietary_daily[f"{key}_items"] / dietary_daily["total_items"]

    rotation_source = appearances.copy()
    rotation_source["meal_period"] = rotation_source["time_open"].map(meal_period)
    rotation_source["station_key"] = rotation_source["station"].str.strip().str.lower().str.replace(r"\s+", " ", regex=True)
    station_day = (
        rotation_source.groupby(["restaurant", "meal_period", "station_key", "service_date"], as_index=False)
        .agg(
            station=("station", "first"),
            food_count=("food_id", "nunique"),
            food_signature=(
                "food_id",
                lambda values: ",".join(str(value) for value in sorted(set(values.astype(int)))),
            ),
        )
        .sort_values(["restaurant", "meal_period", "station_key", "service_date"])
    )
    station_day["previous_signature"] = station_day.groupby(
        ["restaurant", "meal_period", "station_key"]
    )["food_signature"].shift()
    station_day["changed_from_previous"] = (
        station_day["previous_signature"].notna()
        & (station_day["food_signature"] != station_day["previous_signature"])
    )
    station_rotation = (
        station_day.groupby(["restaurant", "meal_period", "station_key"], as_index=False)
        .agg(
            station=("station", "first"),
            service_days=("service_date", "nunique"),
            average_items=("food_count", "mean"),
            distinct_menu_signatures=("food_signature", "nunique"),
            comparable_days=("previous_signature", lambda values: values.notna().sum()),
            changed_days=("changed_from_previous", "sum"),
        )
    )
    station_rotation["change_rate"] = (
        station_rotation["changed_days"] / station_rotation["comparable_days"].replace(0, pd.NA)
    )
    station_rotation = station_rotation.sort_values(
        ["service_days", "change_rate", "station"], ascending=[False, False, True]
    )

    run_daily = (
        runs[runs["target_date"] <= AS_OF_DATE]
        .groupby("target_date", as_index=False)
        .agg(
            attempts=("id", "count"),
            successful_attempts=("status", lambda values: (values == "success").sum()),
            failed_attempts=("status", lambda values: (values == "failed").sum()),
            last_attempt=("started_at", "max"),
        )
    )
    run_daily["had_success"] = run_daily["successful_attempts"] > 0

    comparable_similarity = similarity["jaccard_vs_previous"].dropna()
    recurrence_counts = recurrence["service_days"]
    empty_meals = int((meals["appearances"] == 0).sum())
    empty_menu_days = int(
        meals.groupby("service_date")["appearances"].sum().eq(0).sum()
    )

    eligible_runs = runs[runs["target_date"] <= AS_OF_DATE].copy()
    failure_text = eligible_runs.loc[eligible_runs["status"] == "failed", "error_message"].fillna("")
    failure_categories = {
        "empty_or_partial_source_menu": int(failure_text.str.contains("no restaurants|no foods|meals with no foods", case=False, regex=True).sum()),
        "dns_or_network": int(failure_text.str.contains("NameResolutionError|Max retries exceeded|timed out|timeout", case=False, regex=True).sum()),
    }
    failure_categories["other"] = int((eligible_runs["status"] == "failed").sum()) - sum(failure_categories.values())

    established_station_series = station_rotation[station_rotation["service_days"] >= 10]

    summary: dict[str, object] = {
        "as_of_date": AS_OF_DATE.date().isoformat(),
        "live_start": LIVE_START.date().isoformat(),
        "calendar_days_in_scope": len(expected_dates),
        "days_with_restaurant_rows": int(live_daily["service_date"].nunique()),
        "days_with_usable_menus": int(valid_daily["service_date"].nunique()),
        "calendar_coverage_rate": float(live_daily["service_date"].nunique() / len(expected_dates)),
        "usable_menu_coverage_rate": float(valid_daily["service_date"].nunique() / len(expected_dates)),
        "live_restaurant_names": sorted(appearances["restaurant"].dropna().unique().tolist()),
        "max_restaurants_in_a_day": int(live_daily["restaurants"].max()),
        "distinct_appeared_foods": int(recurrence["food_id"].nunique()),
        "total_food_appearances": int(len(appearances)),
        "median_daily_distinct_foods": float(valid_daily["distinct_foods"].median()),
        "daily_foods_q1": float(valid_daily["distinct_foods"].quantile(0.25)),
        "daily_foods_q3": float(valid_daily["distinct_foods"].quantile(0.75)),
        "min_daily_distinct_foods": int(valid_daily["distinct_foods"].min()),
        "max_daily_distinct_foods": int(valid_daily["distinct_foods"].max()),
        "median_item_service_days": float(recurrence_counts.median()),
        "single_day_items": int((recurrence_counts == 1).sum()),
        "single_day_item_share": float((recurrence_counts == 1).mean()),
        "items_seen_on_10_plus_days": int((recurrence_counts >= 10).sum()),
        "items_seen_every_valid_day": int((recurrence_counts == valid_menu_days).sum()),
        "median_jaccard_vs_previous": float(comparable_similarity.median()),
        "median_menu_turnover_vs_previous": float((1 - comparable_similarity).median()),
        "median_items_added_vs_previous": float(similarity["added_vs_previous"].iloc[1:].median()),
        "median_items_removed_vs_previous": float(similarity["removed_vs_previous"].iloc[1:].median()),
        "median_vegetarian_share": float(dietary_daily["vegetarian_share"].median()),
        "median_vegan_share": float(dietary_daily["vegan_share"].median()),
        "median_gluten_free_share": float(dietary_daily["gluten_free_share"].median()),
        "median_no_top9_share": float(dietary_daily["no_top9_share"].median()),
        "established_high_rotation_station_series": int((established_station_series["change_rate"] >= 0.8).sum()),
        "established_stable_station_series": int((established_station_series["change_rate"] <= 0.3).sum()),
        "empty_meals": empty_meals,
        "empty_menu_days": empty_menu_days,
        "scraper_attempts": int(len(eligible_runs)),
        "scraper_successes": int((eligible_runs["status"] == "success").sum()),
        "scraper_failures": int((eligible_runs["status"] == "failed").sum()),
        "scraper_attempt_success_rate": float((eligible_runs["status"] == "success").mean()),
        "service_dates_with_any_success": int(run_daily["had_success"].sum()),
        "latest_successful_service_date": run_daily.loc[run_daily["had_success"], "target_date"].max().date().isoformat(),
        "failure_categories": failure_categories,
        "quality": quality.iloc[0].to_dict(),
    }

    return AnalysisBundle(
        daily=live_daily,
        appearances=appearances,
        meals=meals,
        runs=runs,
        quality=quality,
        summary=summary,
        recurrence=recurrence,
        similarity=similarity,
        dietary_daily=dietary_daily,
        station_rotation=station_rotation,
        run_daily=run_daily,
    )


def load_and_analyze() -> AnalysisBundle:
    return build_analysis(load_source_data())


def json_ready(value: object) -> object:
    if isinstance(value, dict):
        return {str(key): json_ready(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_ready(item) for item in value]
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if hasattr(value, "item"):
        return value.item()
    return value


if __name__ == "__main__":
    bundle = load_and_analyze()
    print(json.dumps(json_ready(bundle.summary), indent=2, sort_keys=True))
