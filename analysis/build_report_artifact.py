"""Build the validated MCP report payload for the ElonMealsDB history analysis."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from elonmealsdb_history_analysis import (
    APPEARANCES_SQL,
    AS_OF_DATE,
    DAILY_SQL,
    LIVE_START,
    RUNS_SQL,
    load_and_analyze,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "analysis" / "elonmealsdb-history-report-artifact.json"
GENERATED_AT = "2026-08-20T15:45:00Z"


def records(frame: pd.DataFrame) -> list[dict[str, object]]:
    cleaned = frame.copy()
    for column in cleaned.columns:
        if pd.api.types.is_datetime64_any_dtype(cleaned[column]):
            cleaned[column] = cleaned[column].dt.strftime("%Y-%m-%d")
    cleaned = cleaned.astype(object).where(pd.notna(cleaned), None)
    return cleaned.to_dict(orient="records")


def sql_string(value: object) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def literal_table_sql(rows: list[dict[str, object]], columns: list[str]) -> str:
    statements = []
    for row in rows:
        values = []
        for column in columns:
            value = row[column]
            rendered = str(value) if isinstance(value, (int, float)) else sql_string(value)
            values.append(f"{rendered} AS {column}")
        statements.append("SELECT " + ", ".join(values))
    return "\nUNION ALL\n".join(statements)


def build_artifact() -> dict[str, object]:
    bundle = load_and_analyze()
    summary = bundle.summary

    recurrence_labels = {
        "1 day": (1, 1, 1),
        "2 days": (2, 2, 2),
        "3–4 days": (3, 4, 3),
        "5–9 days": (5, 9, 4),
        "10–19 days": (10, 19, 5),
        "20–38 days": (20, 38, 6),
    }
    recurrence_bins = pd.cut(
        bundle.recurrence["service_days"],
        [0, 1, 2, 4, 9, 19, 38],
        labels=list(recurrence_labels),
    ).value_counts(sort=False)
    recurrence_rows = []
    for label, count in recurrence_bins.items():
        minimum, maximum, order = recurrence_labels[str(label)]
        recurrence_rows.append(
            {
                "recurrence_bucket": str(label),
                "bucket_order": order,
                "minimum_service_days": minimum,
                "maximum_service_days": maximum,
                "foods_count": int(count),
                "share_of_distinct_foods": float(count / summary["distinct_appeared_foods"]),
                "distinct_food_population": int(summary["distinct_appeared_foods"]),
                "valid_menu_days": int(summary["days_with_usable_menus"]),
            }
        )

    turnover_rows = records(
        bundle.similarity.iloc[1:][[
            "service_date",
            "previous_valid_date",
            "distinct_foods",
            "jaccard_vs_previous",
            "menu_turnover_vs_previous",
            "added_vs_previous",
            "removed_vs_previous",
            "first_seen_in_history",
        ]]
    )

    rotation = bundle.station_rotation[bundle.station_rotation["service_days"] >= 10].copy()
    rotation["average_items"] = rotation["average_items"].round(1)
    rotation["change_rate"] = rotation["change_rate"].astype(float).round(3)
    rotation["pattern"] = rotation["change_rate"].map(
        lambda value: "Rotates often" if value >= 0.8 else ("Usually stable" if value <= 0.3 else "Mixed rotation")
    )
    rotation_rows = records(
        rotation[[
            "meal_period",
            "station",
            "service_days",
            "average_items",
            "distinct_menu_signatures",
            "comparable_days",
            "changed_days",
            "change_rate",
            "pattern",
        ]].sort_values(["change_rate", "service_days"], ascending=[False, False])
    )

    recommendations = [
        {
            "priority": 1,
            "feature": "Menu Rotation",
            "surface": "Separate section",
            "readiness": "Ready now",
            "evidence": "56.6% median turnover; 19 every-day staples; 177 one-day items",
            "launch_condition": "Use observed menu days as the denominator",
        },
        {
            "priority": 2,
            "feature": "Menu freshness state",
            "surface": "Header and empty state",
            "readiness": "Ready now",
            "evidence": "38 of 44 dates had usable menus; 77 failed attempts",
            "launch_condition": "Separate last success from latest attempt",
        },
        {
            "priority": 3,
            "feature": "Where can I eat now?",
            "surface": "Separate section",
            "readiness": "Prepare now; activate in term",
            "evidence": "Summer maximum is only one stored restaurant per day",
            "launch_condition": "Reliable partial imports plus multi-restaurant coverage",
        },
        {
            "priority": 4,
            "feature": "Dietary coverage comparison",
            "surface": "Restaurant-by-meal table",
            "readiness": "Hold for semantic fix",
            "evidence": "Flags show breadth, but false and unknown are not distinguishable",
            "launch_condition": "Model unknown explicitly and treat missing nutrition as null",
        },
        {
            "priority": 5,
            "feature": "Weekday and peak-choice norms",
            "surface": "Historical visualization",
            "readiness": "Later",
            "evidence": "The current sample is entirely summer and camp operations",
            "launch_condition": "At least four complete in-session weeks",
        },
    ]

    quality_rows = [
        {
            "order": 1,
            "finding": "All-or-nothing date import",
            "evidence": "Any advertised meal with no foods rejects the complete date",
            "user_impact": "More venues create more chances that otherwise valid menus remain stale",
            "recommended_action": "Stage and validate per restaurant or meal, then publish partial coverage explicitly",
        },
        {
            "order": 2,
            "finding": "Incomplete calendar coverage",
            "evidence": "38 usable menu dates in a 44-day live window",
            "user_impact": "Historical denominators and freshness can be misunderstood",
            "recommended_action": "Use observed menu days and show freshness status",
        },
        {
            "order": 3,
            "finding": "Empty historical meals",
            "evidence": "13 meals without stations; two dates with no food rows",
            "user_impact": "An open-hours record can look like a usable menu",
            "recommended_action": "Distinguish hours-only, menu-available, and stale states",
        },
        {
            "order": 4,
            "finding": "Zero used for unknown nutrition",
            "evidence": "16 food IDs and 95 appearances; 32 of 38 usable dates affected",
            "user_impact": "Nutrition rankings and totals can be understated",
            "recommended_action": "Parse absent facts as null and exclude unknowns from ranked metrics",
        },
        {
            "order": 5,
            "finding": "Allergen absence is not three-state",
            "evidence": "The schema stores only true, false, or null; parser defaults absent flags to false",
            "user_impact": "No listed allergen can be misread as verified allergen-free",
            "recommended_action": "Preserve unknown and use conservative public wording",
        },
        {
            "order": 6,
            "finding": "Historical nutrition is mutable",
            "evidence": "Food facts are upserted globally by external ID",
            "user_impact": "Past menus join to latest-known facts rather than facts observed that day",
            "recommended_action": "Add observed-at snapshots before publishing nutrition trends",
        },
    ]

    recommendation_sql = literal_table_sql(
        recommendations,
        ["priority", "feature", "surface", "readiness", "evidence", "launch_condition"],
    )
    quality_sql = literal_table_sql(
        quality_rows,
        ["order", "finding", "evidence", "user_impact", "recommended_action"],
    )

    report_metrics = [
        {
            "usable_menu_days": int(summary["days_with_usable_menus"]),
            "calendar_days": int(summary["calendar_days_in_scope"]),
            "usable_coverage": float(summary["usable_menu_coverage_rate"]),
            "median_turnover": float(summary["median_menu_turnover_vs_previous"]),
            "median_overlap": float(summary["median_jaccard_vs_previous"]),
            "distinct_foods": int(summary["distinct_appeared_foods"]),
            "single_day_foods": int(summary["single_day_items"]),
            "every_day_foods": int(summary["items_seen_every_valid_day"]),
        }
    ]

    daily_source = {
        "id": "daily_menu_coverage_sql",
        "label": "Production daily menu coverage",
        "query": {
            "engine": "mysql",
            "language": "sql",
            "sql": DAILY_SQL.strip(),
            "description": "Aggregates stored restaurants, meals, stations, food appearances, and distinct foods by service date.",
            "executed_at": GENERATED_AT,
            "tables_used": ["elon_meals.restaurants", "elon_meals.meals", "elon_meals.stations", "elon_meals.station_foods"],
            "filters": [
                "Live analysis window begins 2026-07-08",
                "Analysis ends on 2026-08-20",
                "July 1 deterministic seed is excluded from live findings",
                "A usable menu day has at least one station_foods row",
            ],
            "metric_definitions": {
                "usable_menu_days": "Count of calendar dates with at least one stored food appearance in the live window.",
                "usable_coverage": "Usable menu days divided by 44 calendar dates from July 8 through August 20, inclusive.",
            },
        },
    }
    appearances_source = {
        "id": "menu_appearance_history_sql",
        "label": "Production menu appearance history",
        "query": {
            "engine": "mysql",
            "language": "sql",
            "sql": APPEARANCES_SQL.strip(),
            "description": "Loads the final stored food appearances for each live service date at restaurant, meal, station, and food grain.",
            "executed_at": GENERATED_AT,
            "tables_used": [
                "elon_meals.restaurants",
                "elon_meals.meals",
                "elon_meals.stations",
                "elon_meals.station_foods",
                "elon_meals.foods",
            ],
            "filters": [
                "service_date >= 2026-07-08",
                "Only final stored snapshots after any same-date replacement are available",
                "Food recurrence is deduplicated to service_date plus food_id",
            ],
            "metric_definitions": {
                "menu_turnover": "One minus Jaccard similarity between the distinct food-ID set on a usable menu day and the previous usable menu day.",
                "service_days": "Count of distinct usable service dates on which a food or station-meal series appears.",
                "station_change_rate": "Comparable station appearances with a different distinct-food signature than the previous appearance, divided by comparable appearances.",
            },
        },
    }
    runs_source = {
        "id": "scraper_runs_sql",
        "label": "Production scraper-run history",
        "query": {
            "engine": "mysql",
            "language": "sql",
            "sql": RUNS_SQL.strip(),
            "description": "Loads every recorded production scraper attempt in the live analysis window.",
            "executed_at": GENERATED_AT,
            "tables_used": ["elon_meals.scraper_runs"],
            "filters": ["target_date >= 2026-07-08", "Headline attempt counts include target dates through 2026-08-20"],
            "metric_definitions": {
                "failed_attempts": "Rows whose scraper_runs.status is failed.",
                "service_date_with_success": "A target date with at least one scraper_runs.status equal to success.",
            },
        },
    }
    notebook_source = {
        "id": "analysis_notebook",
        "label": "Reproducible ElonMealsDB history analysis",
        "path": "analysis/elonmealsdb-history-analysis.ipynb",
    }
    importer_source = {
        "id": "importer_logic",
        "label": "Production importer validation logic",
        "path": "scraper/elon_scraper/importer.py",
    }
    recommendation_source = {
        "id": "recommendation_synthesis_sql",
        "label": "Evidence-backed feature recommendation matrix",
        "query": {
            "engine": "mysql",
            "language": "sql",
            "sql": recommendation_sql,
            "description": "Materializes the prioritized product recommendations synthesized in the executed analysis notebook.",
            "executed_at": GENERATED_AT,
            "tables_used": [],
            "filters": ["Recommendations are limited to production website features supported or gated by the reviewed summer history"],
            "metric_definitions": {
                "priority": "Decision order assigned from evidence strength, user value, and launch dependency; it is a product judgment rather than a raw source metric."
            },
        },
    }
    quality_source = {
        "id": "quality_synthesis_sql",
        "label": "Data-readiness finding matrix",
        "query": {
            "engine": "mysql",
            "language": "sql",
            "sql": quality_sql,
            "description": "Materializes the reviewed data-readiness findings and recommended remediations from production SQL and importer-code checks.",
            "executed_at": GENERATED_AT,
            "tables_used": [
                "elon_meals.restaurants",
                "elon_meals.meals",
                "elon_meals.stations",
                "elon_meals.station_foods",
                "elon_meals.foods",
                "elon_meals.scraper_runs",
            ],
            "filters": ["Live analysis window begins 2026-07-08", "July 1 seed data is excluded from live findings"],
            "metric_definitions": {
                "order": "Risk-reduction sequence assigned in the analysis notebook; lower values should be addressed first."
            },
        },
    }

    title = "What ElonMealsDB history should become"
    manifest = {
        "version": 1,
        "surface": "report",
        "title": title,
        "description": "Evidence-backed production website recommendations from the summer ElonMealsDB history.",
        "generatedAt": GENERATED_AT,
        "cards": [
            {
                "id": "usable_days_card",
                "description": "Calendar dates with at least one stored food appearance from July 8 through August 20.",
                "dataset": "report_metrics",
                "sourceId": "daily_menu_coverage_sql",
                "metrics": [
                    {"label": "Usable menu days", "field": "usable_menu_days", "format": "number"},
                    {"label": "Calendar coverage", "field": "usable_coverage", "format": "percent"},
                ],
            },
            {
                "id": "turnover_card",
                "description": "Typical change between consecutive observed usable menus.",
                "dataset": "report_metrics",
                "sourceId": "menu_appearance_history_sql",
                "metrics": [
                    {"label": "Median menu turnover", "field": "median_turnover", "format": "percent"},
                    {"label": "Median overlap", "field": "median_overlap", "format": "percent"},
                ],
            },
            {
                "id": "foods_card",
                "description": "Distinct foods present in final stored live menu snapshots.",
                "dataset": "report_metrics",
                "sourceId": "menu_appearance_history_sql",
                "metrics": [
                    {"label": "Distinct foods", "field": "distinct_foods", "format": "number"},
                    {"label": "Seen once", "field": "single_day_foods", "format": "number"},
                    {"label": "Seen every menu day", "field": "every_day_foods", "format": "number"},
                ],
            },
        ],
        "charts": [
            {
                "id": "food_recurrence_chart",
                "title": "Food recurrence by number of service days",
                "subtitle": "July 8–August 19; 177 of 458 distinct foods appeared on only one usable menu day.",
                "type": "bar",
                "dataset": "food_recurrence",
                "sourceId": "menu_appearance_history_sql",
                "valueFormat": "number",
                "encodings": {
                    "x": {"field": "recurrence_bucket", "type": "nominal", "label": "Observed service days"},
                    "y": {"field": "foods_count", "type": "quantitative", "label": "Distinct foods"},
                    "tooltip": [
                        {"field": "share_of_distinct_foods", "type": "quantitative", "label": "Share of foods", "format": "percent"},
                        {"field": "valid_menu_days", "type": "quantitative", "label": "Usable menu days", "format": "number"},
                    ],
                },
            },
            {
                "id": "menu_turnover_chart",
                "title": "Menu turnover versus previous observed menu",
                "subtitle": "Turnover is one minus distinct-food Jaccard overlap; service-schedule changes create visible spikes.",
                "type": "line",
                "dataset": "menu_turnover_daily",
                "sourceId": "menu_appearance_history_sql",
                "valueFormat": "percent",
                "encodings": {
                    "x": {"field": "service_date", "type": "temporal", "label": "Service date"},
                    "y": {"field": "menu_turnover_vs_previous", "type": "quantitative", "label": "Menu turnover"},
                    "tooltip": [
                        {"field": "distinct_foods", "type": "quantitative", "label": "Distinct foods", "format": "number"},
                        {"field": "added_vs_previous", "type": "quantitative", "label": "Added vs previous", "format": "number"},
                        {"field": "removed_vs_previous", "type": "quantitative", "label": "Removed vs previous", "format": "number"},
                        {"field": "first_seen_in_history", "type": "quantitative", "label": "First seen in history", "format": "number"},
                    ],
                },
            },
        ],
        "tables": [
            {
                "id": "station_rotation_table",
                "title": "Established station rotation patterns",
                "subtitle": "Station-and-meal series observed on at least 10 usable service days.",
                "dataset": "station_rotation",
                "sourceId": "menu_appearance_history_sql",
                "defaultSort": {"field": "change_rate", "direction": "desc"},
                "columns": [
                    {"field": "meal_period", "label": "Meal", "type": "text"},
                    {"field": "station", "label": "Station", "type": "text"},
                    {"field": "service_days", "label": "Service days", "format": "number"},
                    {"field": "average_items", "label": "Avg. items", "format": "number"},
                    {"field": "distinct_menu_signatures", "label": "Distinct menus", "format": "number"},
                    {"field": "change_rate", "label": "Change rate", "format": "percent"},
                    {"field": "pattern", "label": "Pattern", "type": "text"},
                ],
            },
            {
                "id": "recommendation_table",
                "title": "Production feature priorities",
                "subtitle": "Recommendations are sequenced by current evidence and semester-readiness dependencies.",
                "dataset": "feature_recommendations",
                "sourceId": "recommendation_synthesis_sql",
                "defaultSort": {"field": "priority", "direction": "asc"},
                "columns": [
                    {"field": "priority", "label": "Priority", "format": "number"},
                    {"field": "feature", "label": "Feature", "type": "text"},
                    {"field": "surface", "label": "Surface", "type": "text"},
                    {"field": "readiness", "label": "Readiness", "type": "text"},
                    {"field": "evidence", "label": "Evidence", "type": "text"},
                    {"field": "launch_condition", "label": "Launch condition", "type": "text"},
                ],
            },
            {
                "id": "quality_table",
                "title": "Data-readiness findings",
                "subtitle": "Issues that affect what the production site can safely claim or display.",
                "dataset": "data_quality_findings",
                "sourceId": "quality_synthesis_sql",
                "defaultSort": {"field": "order", "direction": "asc"},
                "columns": [
                    {"field": "order", "label": "Order", "format": "number"},
                    {"field": "finding", "label": "Finding", "type": "text"},
                    {"field": "evidence", "label": "Evidence", "type": "text"},
                    {"field": "user_impact", "label": "User impact", "type": "text"},
                    {"field": "recommended_action", "label": "Recommended action", "type": "text"},
                ],
            },
        ],
        "sources": [
            daily_source,
            appearances_source,
            runs_source,
            notebook_source,
            importer_source,
            recommendation_source,
            quality_source,
        ],
        "blocks": [
            {"id": "report_title", "type": "markdown", "body": f"# {title}"},
            {
                "id": "executive_summary",
                "type": "markdown",
                "body": (
                    "## Executive Summary\n\n"
                    "- **Ship a dedicated Menu Rotation section first.** Across 38 usable summer menu days, the median menu changed by 56.6% versus the previous observed menu. A stable core of 19 every-day items sits beneath 177 foods that appeared only once.\n"
                    "- **Use the current record as a summer baseline, not a semester benchmark.** Every live stored date contains only Lakeside Dining Hall, so the evidence cannot yet describe multi-restaurant concurrency or normal school-week rhythms.\n"
                    "- **Make freshness visible before school-term scale arrives.** Only 38 of 44 dates had usable menus; 77 scraper attempts failed through August 20, although retries recovered many service dates.\n"
                    "- **Hold safety-sensitive historical claims until the data semantics improve.** Sixteen live food IDs carry zero calories and the allergen flags do not distinguish unlisted from confirmed absent."
                ),
            },
            {
                "id": "definitions",
                "type": "markdown",
                "body": (
                    "## How to read the evidence\n\n"
                    "A **usable menu day** has at least one stored food appearance. **Menu turnover** is one minus the Jaccard overlap between the distinct food sets on consecutive observed usable menus. "
                    "Recurrence percentages use observed menu days—not calendar days—as their denominator. July 1 seed data is excluded. Nutrition and dietary flags are latest-known global food attributes, not day-specific snapshots."
                ),
            },
            {"id": "headline_metrics", "type": "metric-strip", "cardIds": ["usable_days_card", "turnover_card", "foods_card"]},
            {
                "id": "rotation_section",
                "type": "markdown",
                "body": (
                    "## The strongest near-term feature is Menu Rotation\n\n"
                    "The history is deep enough to distinguish dependable staples from limited and rotating foods. This is useful now, even before other restaurants return: show what is new, what returned after a gap, which items are dependable, and which stations change most often."
                ),
            },
            {"id": "food_recurrence_visual", "type": "chart", "chartId": "food_recurrence_chart"},
            {
                "id": "recurrence_interpretation",
                "type": "markdown",
                "sourceId": "menu_appearance_history_sql",
                "body": (
                    "### The menu has a small core and a long rotating tail\n\n"
                    "Of 458 distinct foods, 177 appeared on only one usable menu day, while 19 appeared on all 38. That mix supports two reader-facing modes: a compact **Reliable staples** table and a **What's different today?** stream for discoveries."
                ),
            },
            {
                "id": "turnover_section",
                "type": "markdown",
                "body": (
                    "## Daily change is large enough to make history worth browsing\n\n"
                    "The median overlap with the previous observed menu was only 43.4%. Show the latest additions and removals as exact counts, and use a short 14- or 28-observed-day history for favorites rather than a dense campus-wide matrix."
                ),
            },
            {"id": "menu_turnover_visual", "type": "chart", "chartId": "menu_turnover_chart"},
            {
                "id": "turnover_interpretation",
                "type": "markdown",
                "body": (
                    "### Schedule changes amplify the biggest turnover spikes\n\n"
                    "The line is not a semester trend: summer camps and reduced-service periods change which meals and stations exist. Its product implication is narrower—the stored history contains enough day-to-day movement to justify browsing and favorite-availability features."
                ),
            },
            {
                "id": "station_section",
                "type": "markdown",
                "sourceId": "menu_appearance_history_sql",
                "body": (
                    "## Station identities are surprisingly consistent\n\n"
                    "Seven established station-and-meal series changed on at least 80% of comparable appearances, while three changed on no more than 30%. Translate those rates into plain labels such as **Rotates often**, **Mixed rotation**, and **Usually stable**."
                ),
            },
            {"id": "station_table_block", "type": "table", "tableId": "station_rotation_table"},
            {
                "id": "semester_section",
                "type": "markdown",
                "body": (
                    "## The semester feature should answer where to eat now\n\n"
                    "Once multiple restaurants are reliably stored, add a stepped **restaurants open by time** chart and an **Open now** comparison table with closing time, meals, stations, total items, vegetarian/vegan/gluten-free counts, and freshness. "
                    "The summer record cannot set the benchmark; activate weekday norms only after at least four complete in-session weeks."
                ),
            },
            {"id": "recommendation_table_block", "type": "table", "tableId": "recommendation_table"},
            {
                "id": "freshness_section",
                "type": "markdown",
                "body": (
                    "## More restaurants make freshness a product feature\n\n"
                    "Show **Menu updated**, **Latest attempt**, and one clear state: **Current**, **Using last successful menu**, or **Menu unavailable**. The current importer rejects the complete date when any advertised meal has no foods; that protects against destructive wipes but becomes fragile as the venue count grows."
                ),
            },
            {"id": "quality_table_block", "type": "table", "tableId": "quality_table"},
            {
                "id": "next_steps",
                "type": "markdown",
                "body": (
                    "## Recommended next steps\n\n"
                    "1. **Ship Menu Rotation and freshness together.** Add observed-day recurrence, first-seen/returning counts, station rotation labels, and a last-success state.\n"
                    "2. **Make ingestion partial but explicit.** Stage a date, validate per restaurant or meal, publish valid slices, and attach coverage status instead of rejecting every venue.\n"
                    "3. **Add academic-period and venue-type dimensions.** Tag summer, move-in, in-session, breaks, dining halls, and convenience retail so future comparisons use like-for-like cohorts.\n"
                    "4. **Repair nutrition and allergen unknowns.** Store absent facts as null, preserve the source's explicit flags, and avoid `safe` language that the data cannot verify.\n"
                    "5. **Re-run after four in-session weeks.** Then evaluate open-restaurant concurrency, weekday rhythms, cross-restaurant dietary breadth, and peak-choice periods."
                ),
            },
            {
                "id": "further_questions",
                "type": "markdown",
                "body": (
                    "## Further Questions\n\n"
                    "- What date should mark the first true in-session cohort? Store it rather than infer it later.\n"
                    "- Should all-day convenience retail be compared directly with dining halls or shown as a separate venue type?\n"
                    "- Does the upstream source explicitly distinguish allergen absence from missing information?\n"
                    "- Should favorite history default to the last 14 observed menu days, 28 observed menu days, or same-weekday comparisons?"
                ),
            },
            {
                "id": "caveats",
                "type": "markdown",
                "body": (
                    "## Caveats and Assumptions\n\n"
                    "- The full live window occurred during summer break and camp operations.\n"
                    "- July 1 is deterministic seed data and is excluded.\n"
                    "- July 18 and July 19 have meal windows but no stations or foods.\n"
                    "- Re-importing a date replaces its restaurant hierarchy, so intra-day versions are not retained.\n"
                    "- Nutrition and dietary/allergen fields are globally upserted per food ID; historical menu rows join to latest-known attributes.\n"
                    "- Recommendations are product judgments informed by observed data, not causal claims about student behavior."
                ),
            },
        ],
    }

    snapshot = {
        "version": 1,
        "generatedAt": GENERATED_AT,
        "status": "ready",
        "datasets": {
            "report_metrics": report_metrics,
            "food_recurrence": recurrence_rows,
            "menu_turnover_daily": turnover_rows,
            "station_rotation": rotation_rows,
            "feature_recommendations": recommendations,
            "data_quality_findings": quality_rows,
        },
    }
    sources = [
        daily_source,
        appearances_source,
        runs_source,
        notebook_source,
        importer_source,
        recommendation_source,
        quality_source,
    ]
    return {"surface": "report", "manifest": manifest, "snapshot": snapshot, "sources": sources}


if __name__ == "__main__":
    artifact = build_artifact()
    OUTPUT.write_text(json.dumps(artifact, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(OUTPUT)
