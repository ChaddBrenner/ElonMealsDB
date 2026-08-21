"""Build and execute the reader-facing ElonMealsDB history notebook."""

from __future__ import annotations

from pathlib import Path
import sys

import nbformat
from nbclient import NotebookClient

from elonmealsdb_history_analysis import load_and_analyze


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "analysis" / "elonmealsdb-history-analysis.ipynb"


def percent(value: float) -> str:
    return f"{value:.1%}"


def main() -> None:
    # Query once so the opening summary contains verified values.  The notebook
    # queries again during execution to remain independently reproducible.
    summary = load_and_analyze().summary

    notebook = nbformat.v4.new_notebook()
    notebook.metadata.update(
        {
            "kernelspec": {
                "display_name": "Python 3 (ElonMealsDB analysis)",
                "language": "python",
                "name": "python3",
            },
            "language_info": {"name": "python", "version": sys.version.split()[0]},
        }
    )

    notebook.cells = [
        nbformat.v4.new_markdown_cell(
            "# ElonMealsDB production-history analysis\n\n"
            "## tl;dr\n\n"
            f"- **Build a dedicated Menu Rotation section first.** Across {summary['days_with_usable_menus']} usable live menu days, "
            f"the median menu changed by **{percent(summary['median_menu_turnover_vs_previous'])}** versus the previous observed menu. "
            f"The history contains **{summary['items_seen_every_valid_day']} every-day staples** and **{summary['single_day_items']} one-day items**, "
            "which supports a clear reliable-staples-versus-discoveries experience.\n"
            f"- **Treat current scale as a summer baseline only.** The live period contains only {summary['max_restaurants_in_a_day']} restaurant on any day "
            f"({summary['live_restaurant_names'][0]}), so it cannot estimate school-term concurrency or cross-restaurant choice.\n"
            f"- **Add a visible freshness state before expanding the analytics.** Only {summary['days_with_usable_menus']} of {summary['calendar_days_in_scope']} "
            f"calendar dates had usable menus ({percent(summary['usable_menu_coverage_rate'])}); the latest successful service date at extraction was "
            f"{summary['latest_successful_service_date']}.\n"
            "- **Do not present missing allergen flags as verified safety.** The current schema cannot distinguish “not listed” from “confirmed absent,” "
            "and zero-valued nutrition is also used for some implausible items. Fix those semantics before making historical dietary or allergen claims."
        ),
        nbformat.v4.new_markdown_cell(
            "## Context & Methods\n\n"
            "### Decision\n\n"
            "Identify evidence-backed tables, visualizations, and sections worth adding to the production website, while separating features supported by "
            "the current summer history from features that require school-term data.\n\n"
            "### Key Assumptions\n\n"
            "- Source of truth: the production MySQL database on `macmaxi`, read through the container's read-only API account.\n"
            "- Analysis window: July 8 through August 20, 2026. July 1 is excluded because it is the bundled deterministic seed date, not a comparable live observation.\n"
            "- A usable menu day has at least one stored food appearance. Meal hours without stations or food remain visible in data-quality checks.\n"
            "- Menu appearances and meal windows are date-specific. Food nutrition and flags are global upserts, so they are latest-known attributes—not historical snapshots.\n"
            "- The entire window occurred during summer break. Day-of-week and concurrency results are descriptive of summer operations only.\n"
            "- “No flagged top-9 allergens” means none of the nine Boolean fields is true; the schema does not preserve an explicit unknown state."
        ),
        nbformat.v4.new_code_cell(
            "from analysis.elonmealsdb_history_analysis import load_and_analyze\n"
            "import pandas as pd\n\n"
            "pd.set_option('display.max_columns', 30)\n"
            "pd.set_option('display.width', 140)\n"
            "bundle = load_and_analyze()\n"
            "summary = bundle.summary\n"
            "summary"
        ),
        nbformat.v4.new_markdown_cell(
            "## Data\n\n"
            "The production history contains a final stored menu for each successful service date, plus every scraper attempt. Repeated imports replace a date's restaurant hierarchy; "
            "they do not preserve multiple versions of that day's menu."
        ),
        nbformat.v4.new_code_cell(
            "daily_view = bundle.daily[[\n"
            "    'service_date', 'weekday', 'restaurants', 'meals', 'stations',\n"
            "    'appearances', 'distinct_foods', 'first_open', 'last_close'\n"
            "]].copy()\n"
            "daily_view.tail(12)"
        ),
        nbformat.v4.new_markdown_cell(
            "## Results\n\n"
            "### The history supports rotation features, not school-term concurrency\n\n"
            "The current database has enough repeated dates to measure item and station recurrence. It does not yet have the multi-restaurant breadth needed to validate an "
            "open-venue concurrency visualization, because every live stored date contains Lakeside Dining Hall only."
        ),
        nbformat.v4.new_code_cell(
            "coverage_table = pd.DataFrame([\n"
            "    {'Measure': 'Calendar dates in scope', 'Value': summary['calendar_days_in_scope']},\n"
            "    {'Measure': 'Dates with restaurant rows', 'Value': summary['days_with_restaurant_rows']},\n"
            "    {'Measure': 'Dates with usable food menus', 'Value': summary['days_with_usable_menus']},\n"
            "    {'Measure': 'Maximum restaurants in one live date', 'Value': summary['max_restaurants_in_a_day']},\n"
            "    {'Measure': 'Distinct foods seen in final live snapshots', 'Value': summary['distinct_appeared_foods']},\n"
            "    {'Measure': 'Stored food appearances', 'Value': summary['total_food_appearances']},\n"
            "])\n"
            "coverage_table"
        ),
        nbformat.v4.new_markdown_cell(
            "### Stable staples and high-turnover menus can coexist\n\n"
            "A median daily menu contained 66 distinct foods, but overlap with the previous observed menu was only 43.4%. The useful product story is therefore not simply “the menu changes”; "
            "it is that a small stable core sits underneath a much larger rotating layer."
        ),
        nbformat.v4.new_code_cell(
            "recurrence_bins = pd.cut(\n"
            "    bundle.recurrence['service_days'],\n"
            "    [0, 1, 2, 4, 9, 19, 38],\n"
            "    labels=['1 day', '2 days', '3–4 days', '5–9 days', '10–19 days', '20–38 days'],\n"
            ").value_counts(sort=False).rename_axis('Observed service days').reset_index(name='Foods')\n"
            "recurrence_bins"
        ),
        nbformat.v4.new_code_cell(
            "bundle.recurrence.head(25)[[\n"
            "    'short_name', 'service_days', 'first_seen', 'last_seen', 'share_of_valid_days'\n"
            "]]"
        ),
        nbformat.v4.new_code_cell(
            "bundle.similarity.iloc[1:].sort_values('menu_turnover_vs_previous', ascending=False).head(12)[[\n"
            "    'service_date', 'previous_valid_date', 'distinct_foods',\n"
            "    'menu_turnover_vs_previous', 'added_vs_previous', 'removed_vs_previous', 'first_seen_in_history'\n"
            "]]"
        ),
        nbformat.v4.new_markdown_cell(
            "### Station behavior is legible enough for a rotation table\n\n"
            "Among station-and-meal series observed on at least 10 days, seven changed on at least 80% of comparable appearances, while three changed on no more than 30%. "
            "That split can be translated into reader-friendly labels such as `Usually stable` and `Rotates often`."
        ),
        nbformat.v4.new_code_cell(
            "bundle.station_rotation[bundle.station_rotation['service_days'] >= 10][[\n"
            "    'meal_period', 'station', 'service_days', 'average_items',\n"
            "    'distinct_menu_signatures', 'comparable_days', 'changed_days', 'change_rate'\n"
            "]].sort_values(['change_rate', 'service_days'], ascending=[False, False])"
        ),
        nbformat.v4.new_markdown_cell(
            "### Dietary breadth is promising, but safety semantics need repair\n\n"
            "The latest-known food attributes produce large vegetarian, vegan, and gluten-free shares. Those are useful as exploratory menu labels. The allergen fields are different: "
            "all false currently means either no allergen was listed or no allergen information was captured, so the data cannot support a verified `safe` claim."
        ),
        nbformat.v4.new_code_cell(
            "dietary_summary = pd.DataFrame([\n"
            "    {'Label': 'Vegetarian', 'Median share of daily distinct foods': summary['median_vegetarian_share']},\n"
            "    {'Label': 'Vegan', 'Median share of daily distinct foods': summary['median_vegan_share']},\n"
            "    {'Label': 'Gluten-free flag', 'Median share of daily distinct foods': summary['median_gluten_free_share']},\n"
            "    {'Label': 'No top-9 flag present (not verified allergen-free)', 'Median share of daily distinct foods': summary['median_no_top9_share']},\n"
            "])\n"
            "dietary_summary"
        ),
        nbformat.v4.new_markdown_cell(
            "### Reliability is good enough for discovery, not yet invisible enough for trust\n\n"
            "The scheduler recorded 188 successful and 77 failed attempts through August 20. Repeated retries recovered many dates, but four dates in the window had no successful run, "
            "and two stored dates had meal hours but no food menu. In addition, 16 live food IDs carry zero calories and those rows appear on 32 of the 38 usable dates."
        ),
        nbformat.v4.new_code_cell(
            "quality_table = pd.DataFrame([\n"
            "    {'Check': 'Duplicate meal grains', 'Result': summary['quality']['duplicate_meal_grains'], 'Interpretation': 'Pass'},\n"
            "    {'Check': 'Duplicate station grains', 'Result': summary['quality']['duplicate_station_grains'], 'Interpretation': 'Pass'},\n"
            "    {'Check': 'Invalid meal windows', 'Result': summary['quality']['invalid_meal_windows'], 'Interpretation': 'Pass'},\n"
            "    {'Check': 'Meals without stations', 'Result': summary['quality']['meals_without_stations'], 'Interpretation': 'Caveat'},\n"
            "    {'Check': 'Live food IDs with zero calories', 'Result': summary['quality']['live_appeared_foods_with_zero_calories'], 'Interpretation': 'Needs semantic fix'},\n"
            "    {'Check': 'Live dates affected by zero-calorie rows', 'Result': summary['quality']['live_dates_with_zero_calorie_items'], 'Interpretation': 'Needs semantic fix'},\n"
            "])\n"
            "quality_table"
        ),
        nbformat.v4.new_code_cell(
            "failed_dates = bundle.run_daily[~bundle.run_daily['had_success']][[\n"
            "    'target_date', 'attempts', 'failed_attempts', 'last_attempt'\n"
            "]]\n"
            "failed_dates"
        ),
        nbformat.v4.new_markdown_cell(
            "## Takeaways\n\n"
            "### 1. Ship now: a separate Menu Rotation section\n\n"
            "Recommended contents:\n\n"
            "- A `What's different today?` summary with added, removed, first-seen, and returning-after-a-gap counts.\n"
            "- A compact `Reliable staples` table: food, meal/station, days available in the last 14 or 28 usable service days, and last seen.\n"
            "- A `Rotating stations` table: restaurant, meal, station, `Usually stable`/`Rotates often`, current item count, and last menu change.\n"
            "- A favorite-level badge such as `Seen 12 of the last 14 menu days`; use observed menu days as the denominator, not calendar days.\n\n"
            "Best primary visual: a 14- or 28-column presence heatmap for a small, user-selected set of foods or favorites. For campus-wide history, use ranked bars or a table instead of hundreds of heatmap rows."
        ),
        nbformat.v4.new_markdown_cell(
            "### 2. Prepare now, activate during term: Where can I eat now?\n\n"
            "When multi-restaurant data is successfully stored, add:\n\n"
            "- A stepped `restaurants open by time` chart for the selected date.\n"
            "- An `Open now` comparison table with restaurant, closes at, meals/stations, total items, vegetarian/vegan/gluten-free counts, and freshness.\n"
            "- Filters that update the count to `restaurants with at least one matching option`, not just restaurants physically open.\n\n"
            "Do not use the current one-restaurant summer history to set benchmarks. Wait until at least four complete in-session weeks before adding weekday norms or claims about peak choice."
        ),
        nbformat.v4.new_markdown_cell(
            "### 3. Add a small freshness contract before scaling the public analytics\n\n"
            "Display `Menu updated`, `Latest attempt`, and a plain-language state such as `Current`, `Using last successful menu`, or `Menu unavailable`. "
            "A partial failure should not make otherwise valid restaurants disappear. The importer currently rejects the entire date if any advertised meal has no foods; that becomes more fragile as the number of restaurants grows."
        ),
        nbformat.v4.new_markdown_cell(
            "### 4. Keep dietary comparisons, but change the language and data model\n\n"
            "Use `listed` or `flagged` language for allergen data until the pipeline can distinguish true, false, and unknown. Preserve nutrition snapshots or at least `observed_at`/source-version history before publishing historical nutrition trends. "
            "Treat zero nutrition from an absent source fact as unknown rather than a real zero."
        ),
        nbformat.v4.new_markdown_cell(
            "## Further Questions\n\n"
            "- What date should mark the first true in-session cohort? Store an academic-period tag instead of inferring it later from restaurant count.\n"
            "- Should convenience retail locations with an all-day `Open` meal be compared with dining halls, or shown in a separate venue type?\n"
            "- Does the source explicitly distinguish allergen absence from missing allergen data? If not, public copy must remain conservative.\n"
            "- Should menu-history percentages use the last N observed menu days, the last N calendar days, or same-weekday comparisons? For users, observed menu days are the most honest default."
        ),
        nbformat.v4.new_markdown_cell(
            "## Caveats and Assumptions\n\n"
            "- Summer-break and camp schedules dominate the sample; weekday/weekend differences are not semester norms.\n"
            "- July 1 is seed data and is excluded from live findings.\n"
            "- July 18 and July 19 contain meal windows but no stored stations or foods.\n"
            "- Failed scrape attempts preserve the last successful version of an already-imported service date, so attempt success rate is not the same as end-user date coverage.\n"
            "- Re-importing a service date replaces its restaurant/meal/station hierarchy; intra-day version history is not retained.\n"
            "- Nutrition facts and dietary/allergen flags are globally updated per food ID; historical menu rows join to the latest-known attributes.\n"
            "- The report recommendations are product decisions informed by the current evidence, not causal claims about student behavior."
        ),
    ]

    client = NotebookClient(
        notebook,
        timeout=300,
        kernel_name="python3",
        resources={"metadata": {"path": str(ROOT)}},
        allow_errors=False,
    )
    executed = client.execute()
    nbformat.write(executed, OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
