# ElonMealsDB: Project, Data, and Website Reference

> Verified against the application source on August 21, 2026. This document describes the current implementation on the `codex/source-fidelity-ui-and-analysis` branch; it distinguishes source facts from values derived by the API or browser.

## 1. Project overview

ElonMealsDB is an independent, full-stack dining-data application for exploring Elon Dining menus. A scheduled Python collector reads Elon Dining's own menu-and-hours and location pages, validates the response structure and requested service date, and imports a normalized snapshot into MySQL. A read-only Express API turns those tables into menu, search, coverage, and nutrition-analysis responses. A React/TypeScript single-page application presents the result as a restaurant and meal browser, searchable food table, nutrition detail view, analytical dashboard, and browser-local meal planner.

The production path is:

1. `scraper-scheduler` runs at configured America/New_York times (by default 06:30, 12:15, and 15:15) and requests today plus the configured number of future dates (one day by default).
2. The collector starts at `https://www.elondining.com/menu-hours/?date=YYYY-MM-DD`, follows only qualifying Elon-owned location pages, and deliberately does **not** scrape third-party sites or linked PDFs. Elon-published hours and exact outbound URLs for those link-only resources are still retained.
3. The importer validates the complete payload before opening its replacement transaction. For a service date, restaurants and their cascading meals, stations, and station placements are replaced only after validation succeeds; a failed or structurally inconsistent collection cannot erase the last complete menu.
4. MySQL stores both the source hierarchy and import audit history. Food recipe IDs are treated as source identifiers, not as globally nutrition-stable primary keys: the same recipe can have multiple stored content variants.
5. The public Node/Express service uses a least-privilege, read-only MySQL account. It exposes fixed, validated read endpoints; imports use a separate private writer account.
6. Nginx serves the Vite-built React application and proxies `/api` to Express. In the included Compose deployment, only the frontend is bound to the host; the API, database, one-shot scraper, and scheduler stay on a private Docker network.

The application intentionally has no server-side user accounts. Favorites, selected meal-plan foods, nutrition goals, and safety preferences remain in browser storage. That keeps personal planning state out of the database described below: MySQL contains public dining-source data, derived query results, and scraper run metadata only.

The main implementation stack is React 18, TypeScript, and Vite in the browser; Express, Zod, `mysql2`, Helmet, rate limiting, and structured logging in the API; MySQL 8.4 for storage; Python, Requests, Beautiful Soup, and PyMySQL for collection/import; and Docker Compose for deployment. The project is not affiliated with Elon University or Elon Dining, and the interface directs users to verify official source information—especially allergen and medical information.

## 2. Elon Dining data collected and stored in MySQL

### 2.1 Source surfaces and resource scope

The current collector uses a versioned source contract (`source_contract_version = 4`) rather than an undocumented JSON API. Network inspection found that the useful historical menu data is server-rendered. The WordPress `nmc-menu/v2` routes and legacy per-recipe route tested during development did not provide a reliable, date-addressable replacement. The working source surfaces are therefore:

- **Menu-and-hours page:** `https://www.elondining.com/menu-hours/?date=YYYY-MM-DD`. The collector reads the page's requested-date value, venue groups, location names, resource URLs, source-authored service-window names, opening and closing epoch attributes, and the row/hour state classes.
- **Elon location pages:** same-origin `/locations/...` pages. The collector checks the location identity and service-date timestamp, pairs visible meal-tab labels with their content panels by `data-tabid`, reads station names and IDs, and parses each food's embedded nutrition JSON keyed by its encoded recipe identifier.
- **Link-only resources:** any menu-hours entry with valid service windows but an external-domain URL, PDF URL, or a same-origin URL that safely resolves or redirects outside the supported Elon location-page contract. The linked target is not scraped. Its Elon-published name, venue, source service windows, resource classification, menu status, and exact outbound URL are still imported.
- **Hours-only Elon resources:** a same-origin non-location link is classified as `elon_resource` and retained from the hours page without trying to parse it as a location menu. A valid `/locations/...` page that is fetched successfully but publishes no structured menu tabs is also retained as `hours_only`. Both cases produce restaurant/meal records with no station or food children.

An entry with no service-hours rows is recorded only in the collector's excluded-resource output and is not inserted into MySQL. External and PDF documents are never parsed for menus, ingredients, or nutrition.

### 2.2 Normalization and source-fidelity rules

Before persistence, the collector and importer independently recompute and validate the hierarchy. The safeguards that affect stored data are:

- the menu-hours date and each location-page date must equal the requested Eastern service date;
- every stored resource must have at least one opening/closing window; opening must start on the service date, closing must follow opening, and a window cannot exceed 24 hours;
- duplicate location names or URLs are rejected;
- only HTTP(S) resource URLs are allowed; an `elon_location` must remain on an Elon hostname, begin with `/locations/`, and not be a PDF;
- hours-page location and venue names must match the location page;
- meal label/panel counts, tab IDs, station structure, recipe IDs, and embedded nutrition JSON must be structurally valid;
- hours and menu tabs are matched by a normalized source meal name, not by assuming the two pages use the same positional order;
- the collector and importer both verify restaurant, meal, station, food-placement, distinct-recipe, and variant counts;
- the importer accepts empty food lists only when the explicit status explains them (`empty_menu`, `hours_only`, `not_published`, `external`, or `pdf`); an `available` meal must contain food;
- a debug-limited or older incomplete payload cannot replace a date. A verified complete payload is validated before the transaction deletes existing date-scoped restaurants. Any database error rolls the transaction back.

The importer stores Elon timestamps as MySQL `DATETIME` values after parsing the source ISO timestamp; the parser originally converts source epoch seconds in `America/New_York`. Text is whitespace-normalized by the parser, trimmed by the importer, and limited to each column's declared length. Numeric values that are missing or not numeric become SQL `NULL`, preserving “unknown” instead of inventing zero. Nullable dietary/allergen booleans likewise preserve unknown states.

### 2.3 Relational hierarchy and field catalog

The hierarchy is `restaurants → meals → stations → station_foods ↔ foods`. Deleting a date's restaurants cascades through its meals, stations, and placements. Food variants are shared reference records and are not deleted by the date replacement; public menu queries only return variants that still have a station placement.

#### `restaurants`: one resource for one service date

| Column | Origin and meaning |
| --- | --- |
| `id` | Internal auto-increment primary key; not supplied by Elon. |
| `name` | Elon-published location/resource link text, such as a dining hall or retail operation. |
| `url` | Exact source target used for the resource. For an Elon location this is its location URL; for external/PDF/redirected resources it is the retained outbound target. |
| `venue_name` | Source venue/group heading from the menu-hours page. |
| `service_date` | Requested and source-verified calendar date. The same name may have a separate row on another date; `(name, service_date)` is unique. |
| `source_kind` | Resource classification: `elon_location`, `elon_resource`, `external_link`, or `pdf`. |
| `menu_status` | Restaurant-level structured-menu state: `available`, `hours_only`, `external`, or `pdf`. |
| `created_at` | Database insertion timestamp generated by MySQL; not source data. |

#### `meals`: every Elon-published service window

Despite the table name, a row is a **source service window**, so its name can be `Breakfast`, `Lunch`, `Dinner`, `Open`, `Hours`, or another source-authored label.

| Column | Origin and meaning |
| --- | --- |
| `id`, `restaurant_id` | Internal primary key and parent foreign key. |
| `name` | Exact service-window/meal name from the menu-hours `data-name` attribute (with `Hours` as the structural fallback if the source has no label). This is what prevents an `Open` window from being relabeled as `Breakfast`. |
| `time_open`, `time_closed` | Source opening and closing epochs converted through Eastern time and stored as date-time values. They drive the visible time range and open/closed/upcoming calculations. |
| `menu_status` | Window-level state: `available`, `empty_menu`, `hours_only`, `not_published`, `external`, or `pdf`. `not_published` means the hours page advertised the window but the Elon location page had no matching menu tab. |
| `menu_label` | Full source meal-tab label from the location page, when a matching structured menu exists; for example a meal name plus a parenthesized time string. |
| `menu_time_label` | Time-label portion parsed from the location menu-tab label. This preserves source wording when present instead of regenerating it from the hours. |

Every external or PDF restaurant still has these meal rows, including exact source labels and times, but has no stations or foods. This is the data used to show the resource's hours and link on ElonMealsDB.

#### `stations`: menu groupings inside a structured meal

| Column | Origin and meaning |
| --- | --- |
| `id`, `meal_id` | Internal primary key and parent foreign key. |
| `name` | Visible Elon station heading within the meal tab. |
| `source_id` | Source station identifier from the heading's `data-id`, when present. It is retained as text because the source contract, not the database, owns its format. |

#### `foods`: source recipe/content variants

The food identity model deliberately does not assume that an Elon recipe ID has globally stable nutrition. A unique row is identified by `(external_id, content_hash)`: the same source recipe ID can coexist with multiple context-correct content variants.

| Column/group | Origin and meaning |
| --- | --- |
| `id` | Internal auto-increment variant ID used by foreign keys and the UI. |
| `external_id` | Original encoded `data-recipe` value from Elon. This remains the searchable/source-facing recipe identifier. |
| `source_recipe_id` | Decoded recipe component when the encoded identifier can be decoded (for example, the value after `recipe:`); nullable if decoding is not possible. |
| `content_hash` | Deterministic SHA-256 hash of the normalized food payload, excluding only the already-computed hash and nonpersisted searchable terms. It includes identity text, nutrition, dietary attributes, allergen state, and ordered facts. |
| `short_name` | Visible linked food name in the menu item. |
| `full_name` | Name from embedded nutrition JSON, falling back to the visible short name. |
| `description` | Source description, nullable. |
| `ingredients` | Source ingredient list, nullable and stored as text. |
| `disclaimer` | Source nutrition/allergen disclaimer, nullable and stored as text. |
| `hide_allergens` | Source `hideAllergens` flag. When true, absence of an allergen is treated as unknown rather than “free from.” |
| `serving_size_amount` | Parsed numeric portion of the source serving size. Whole numbers, decimals, fractions, and mixed fractions are supported; nullable if unparseable or missing. |
| `serving_size_unit` | Remaining source serving-size text/unit; an unparseable full value is retained here. |
| `calories` | Calories per source serving. |
| `calories_from_fat` | Calories from fat per source serving. |
| `total_fat`, `saturated_fat`, `trans_fat` | Published fat values, normally grams. |
| `cholesterol`, `sodium` | Published cholesterol and sodium values, normally milligrams. |
| `total_carbohydrates`, `dietary_fiber`, `sugars`, `added_sugars` | Published carbohydrate-related values, normally grams. Both `Total Carbohydrate` and `Total Carbohydrates` source labels map to the total-carbohydrate scalar. |
| `protein` | Published protein value, normally grams. |
| `potassium`, `calcium`, `iron`, `vitamin_d` | Published micronutrient values when present. The original unit remains available in the ordered facts table described below. |
| `vegetarian`, `vegan`, `gluten_free` | Nullable source dietary flags derived from food-link CSS classes or embedded attribute/preference objects. “Made without gluten” maps to `gluten_free`; these are source classifications, not independent guarantees. |
| `allergy_egg`, `allergy_shellfish`, `allergy_soy`, `allergy_peanut`, `allergy_wheat`, `allergy_tree_nut`, `allergy_milk`, `allergy_sesame`, `allergy_fish` | Nullable flags for the nine named allergens. Positive values come from source CSS classes and/or the embedded allergen list. A published allergen panel with no match yields false; a hidden allergen panel yields `NULL` for otherwise absent allergens. `soybean` maps to soy, and singular/plural tree-nut labels map to tree nut. |

All scalar nutrition columns are nullable `DECIMAL` values. Common macros are duplicated out of the ordered facts into indexed/query-friendly columns so search, filters, rankings, planner totals, and station averages do not need to interpret arbitrary labels at request time.

#### `food_nutrition_facts`: the complete ordered source fact rows

One food variant can have any number of fact rows. The composite primary key is `(food_id, position)` and the rows are replaced whenever that exact variant is upserted.

| Column | Origin and meaning |
| --- | --- |
| `food_id`, `position` | Variant foreign key and zero-based source order. The position preserves the source presentation sequence. |
| `label` | Source fact label; not limited to the known scalar mappings. |
| `unit` | Source unit string. |
| `value` | Parsed numeric source amount, nullable. |
| `percent_daily_value` | Source `percent_drv` value, nullable. It is stored once here and rendered in a dedicated `%DV` column rather than repeated as label text. |
| `is_secondary` | Source secondary/sub-row flag used to retain hierarchy/presentation semantics. |

The scalar mapper currently recognizes Calories, Calories from Fat, Total Fat, Saturated Fat, Trans Fat, Cholesterol, Sodium, Total Carbohydrate(s), Dietary Fiber, Total Sugars/Sugars, Added Sugars, Protein, Potassium, Calcium, Iron, and Vitamin D. Unrecognized labeled facts are still retained in this child table.

#### `food_dietary_attributes`: extensible source tags

This child table prevents the three common booleans from discarding additional Elon attributes such as `Coolfood`.

| Column | Origin and meaning |
| --- | --- |
| `food_id` | Parent food-variant foreign key. |
| `attribute_key` | Source `icon` or `html_attribute`; if absent, a lowercase underscore key is derived from the name. Unique per food. |
| `name` | Source display name, falling back to a title-cased key. |

#### `station_foods`: occurrence/placement link

`station_foods(station_id, food_id)` records that a specific content variant appears at a specific station. This many-to-many table lets a variant appear at multiple stations or meals without copying its nutrition columns. The composite primary key prevents the exact same variant from being duplicated within one station. It also establishes three deliberately different count concepts:

| Column | Origin and meaning |
| --- | --- |
| `station_id` | Foreign key to the source-context station where the occurrence was published. |
| `food_id` | Foreign key to the exact encoded-ID/content-hash food variant published at that station. |

- **distinct recipes:** unique `foods.external_id` values;
- **food variants:** unique internal `foods.id` / `(external_id, content_hash)` records represented in the selected hierarchy;
- **menu-item placements:** station-to-food occurrences. One recipe or variant can contribute multiple placements.

#### `scraper_runs`: freshness, completeness, and failure audit trail

| Column | Origin and meaning |
| --- | --- |
| `id` | Internal run record ID. |
| `source_url` | Date-addressed menu-hours URL for the collection attempt. |
| `target_date` | Service date the attempt targeted. |
| `started_at`, `finished_at` | UTC-naive database timestamps taken around import processing; a failure record also receives both timestamps. |
| `status` | `success`, `failed`, or schema-supported `partial`. The current verified importer writes `success`; error handling writes `failed`. |
| `restaurants_count`, `meals_count` | Validated hierarchy counts. |
| `foods_count` | Legacy run-volume count; in the current collector it equals the number of food placements, not distinct recipes. |
| `distinct_recipes_count` | Unique encoded source recipe IDs in the completed payload. |
| `food_variants_count` | Unique `(external_id, content_hash)` pairs in the completed payload. |
| `menu_item_placements_count` | Total station-food occurrences in the completed payload. |
| `error_message` | Trimmed failure text for failed attempts; `NULL` on success. |

### 2.4 Collected or derived values that are not stored as SQL columns

For completeness, the collection JSON also contains operational/source-verification data that the importer currently uses only during collection, validation, returned summaries, or logs:

- collection contract version/status, collection timestamp and method labels;
- discovered, excluded, warning, station, and hierarchy counts beyond the run columns;
- source current-state classes (`open`, `closed`, `upcoming`, or `scheduled`) for location and hours rows—the website calculates current state from persisted times instead of storing this scrape-time state;
- canonical location URL, WordPress location post ID, and source meal-tab ID;
- original menu-item searchable terms;
- redirect chains, content type, response body metadata, retry details, and exclusion reasons;
- warning strings, including hours-without-menu and empty/not-published menu-tab observations;
- the excluded-resource list for rows that had no usable service hours.

These omissions are intentional descriptions of the present schema, not claims that the collector never observes those values.

## 3. Website data usage and major interface elements

### 3.1 Read path from MySQL to the browser

On startup, the browser requests available service dates. It chooses today in Eastern time when today has an imported snapshot; otherwise it chooses the newest imported date. For the chosen date it concurrently loads restaurant summaries, station metrics, nutrition insights, and up to 200 placed food occurrences for date-wide local lookup. Selecting a restaurant triggers a separate hierarchy request for that restaurant's meals, stations, and food variants.

| API route | Database work | Current browser use |
| --- | --- | --- |
| `GET /api/service-dates` | Groups the full hierarchy by service date; returns restaurant, meal, station, distinct-recipe, variant, and placement counts plus the latest successful `scraper_runs.started_at`. | Chooses the initial date, identifies the newest imported date, and supplies the footer freshness timestamp. |
| `GET /api/restaurants?date=…` | Returns each resource/status, hierarchy counts, earliest open, and latest close for the date. | Supplies restaurant selection and timeline summaries. |
| `GET /api/restaurants/:id/menu` | Reconstructs the chosen restaurant's ordered meal → station → food hierarchy and attaches complete nutrition facts and dietary attributes. | Supplies meal tabs, station filters, overview/table rows, the selected-meal charts, and resource-link states. |
| `GET /api/foods?date=…[&q=…]` | Searches placed foods in the date's full hierarchy and attaches restaurant, meal, station, time, nutrition-fact, and dietary context; returns at most 200 occurrences. | A date-only request refreshes favorite snapshots and planner context. Debounced `q` requests power global search. |
| `GET /api/metrics/stations?date=…` | Aggregates up to 12 populated stations by food count, average calories/protein, and vegan/vegetarian/gluten-free counts. | Loaded by the browser and used as a fallback for resolving a food's restaurant/meal time window before it enters the local planner. It is not rendered as a standalone station-comparison panel. |
| `GET /api/metrics/nutrition-insights?date=…` | Computes service windows, date-wide food rankings, station constraint/macro aggregates, and cross-date station-change detection. | Supplies the restaurant timeline, selected-meal station heatmap/fingerprints, campus-wide ranking/coverage lists, and “Different today” station badges. |

The API also exposes `/api/metrics/coverage`, `/api/import-runs`, and `/api/sql-proof`. They provide date coverage/top-protein/import-freshness data and fixed SQL examples for diagnostics or portfolio review, but the current React page does not request or display them. `/api/health` and `/api/ready` are operational endpoints, not interface content.

Global search uses MySQL full-text matching over food short name, full name, description, and ingredients, with escaped `LIKE` matching for those fields plus restaurant, meal, and station. Exact and prefix food-name matches receive the largest fixed boosts, followed by contains-name, station, meal, restaurant, description, and ingredient matches; results then use full-text relevance and deterministic context ordering. The UI validates the same 80-character safe character set and waits 180 ms after typing before it sends the query.

### 3.2 Application header and global controls

- **Brand and date selector.** The compact top bar shows the ElonMealsDB mark and a native date input. Changing the date clears all restaurant/menu-specific state before loading the new snapshot. A date with no rows shows a purposeful empty state and, when possible, a button back to the newest imported date.
- **Global search launcher.** A full-width trigger advertises search across foods, ingredients, and stations and shows `⌘K` on Apple platforms or `Ctrl K` elsewhere. Either activation method opens the global search dialog described below.
- **Theme control.** A sun/moon button switches light and dark themes. The chosen theme is saved in browser `localStorage`, independent of MySQL.
- **Errors and loading.** API errors appear in a dismissible alert. Menu/date transitions use explicit loading and empty states rather than leaving stale data visible.

### 3.3 Sticky calorie and macro goal header

The `PlanSummaryBar` shows four goal cards—Calories, Protein, Carbs, and Fat—using the sum of foods in the browser-local plan for the selected date. Each card displays the current total against the user's goal and a clamped percentage progress bar with its own macro color. Default goals are 2,200 calories, 135 g protein, 260 g carbohydrates, and 75 g fat; the settings dialog permits bounded edits.

The bar is `position: sticky` near the top of the viewport. On desktop it compacts after the page passes 88 px and does not expand again until the page returns to 40 px or less. This hysteresis, a passive scroll listener scheduled through `requestAnimationFrame`, and disabled scroll anchoring prevent the header's height transition from moving or snapping the user's scroll position. The transition changes padding, borders, surface color, and shadow—not page margin or transform. On narrow layouts the goals are already arranged compactly.

### 3.4 Restaurant service-window timeline

The horizontal restaurant selector is also a time-based visualization. Each row/tab represents one imported restaurant/resource and contains:

- the restaurant name and a status dot;
- one proportional segment per persisted service window;
- a status phrase such as `Closes 5:00 PM`, the next opening range, `Closed today`, or the scheduled overall range for a non-current date;
- a vertical “now” line, updated once per minute, only when the selected service date is today in Eastern time.

The chart domain expands around the day's earliest and latest service times, with 7:00 AM and 8:00 PM as baseline bounds and a 30-minute margin, then maps each window to percentage position/width. Very narrow segments omit their internal label but retain a full hover title. `Breakfast`, `Lunch`, and `Dinner` use their established meal tones; a source-authored `Open` window receives its distinct pink/macro-fat accent; other labels use the general service tone. Real-time open/closed status is recomputed from the persisted times—scrape-time CSS state is not reused. Restaurant tabs support click/tap plus arrow, Home, and End keyboard navigation.

### 3.5 Restaurant menu panel

#### Meal tabs

The menu panel begins with one tab per persisted service window. For unique names, the source `meals.name` is primary (`Open` stays `Open`) and the formatted database time range is secondary. If multiple windows share the same name, the time range becomes primary so the tabs remain distinguishable and the shared source name becomes secondary. Selecting a meal clears the station filter. Tabs use the same accessible keyboard navigation as restaurant tabs.

#### Link-only, hours-only, and empty-menu state

If the active meal has no stations, the panel interprets the stored resource and meal statuses instead of treating the scrape as a generic failure. It explains whether the menu is external, a PDF/document, not published for the advertised service window, an explicitly empty tab, or simply unavailable as structured data. A definition list shows **every persisted source service label and time range**, and a button opens the exact stored Elon, external, or PDF URL in a new tab. This neutral/green source-information panel does not inherit the pink `Open` timeline color.

#### Station filter strip

For structured meals, a horizontally scrollable green-themed pill strip shows `All stations` and each source station. The badge normally shows the number of food placements. When any dietary/allergen filter is active, it instead shows `safe/total`, calculated locally for each station. Selecting the Station control inside a food row activates the same filter without opening the nutrition drawer.

A `Different today` badge appears when the backend determines that a station's distinct recipe-ID signature is atypical for that same normalized restaurant name, meal name, and station name across stored dates. With at least two comparison dates, the current signature must match no more than 25% of them while the historical modal signature accounts for at least 50%; with one comparison date, any mismatch qualifies.

#### Safety and display controls

The filter row provides Vegan, Vegetarian, and Gluten free toggles plus an `Avoid` selector for soy, milk, wheat, egg, sesame, fish, peanut, and tree nut. Multiple allergen chips can be active. All filters are conjunctive. An allergen avoidance match requires the relevant database value to be explicitly `false`; `NULL`/hidden/unknown allergen information is never treated as safe. Safety choices are saved in the local profile after a user activates them.

The view toggle switches between `Table` and `Overview`; screens at or below 760 px automatically start in Overview. A column picker persists visibility for Station, Dietary, Calories, Protein, Carbs, and Fat. Hiding the currently sorted macro also clears that sort.

#### Food overview

Overview is a compact station-grouped list. Each station heading can carry the `Different today` badge, and its source food names appear in a responsive grid of small rows. Clicking a food opens nutrition details; the adjacent plus control adds it to the local plan. Dietary and safety filters are applied before groups are rendered, so empty groups disappear.

#### Food table and mobile rows

The desktop view is a semantic table with a sticky header. Its possible columns are:

| Column | Display and interaction |
| --- | --- |
| Food | Source short name plus a local favorite star. Clicking the name—or any noncontrol area in the row—opens the nutrition drawer. |
| Station | Normalized title-case station name and optional `Different today` badge. Clicking it filters the menu to that station. |
| Dietary | Source-derived Vegan, Veg, GF, Allergen, `Allergens not published`, and arbitrary additional-attribute badges. |
| Calories | Scalar calories per source serving. |
| Protein | Scalar grams per source serving. |
| Carbs | Scalar total-carbohydrate grams per source serving. |
| Fat | Scalar total-fat grams per source serving. |
| Actions | A compact plus/check button that adds the occurrence to the plan without opening the drawer. |

Calories, protein, carbs, and fat headers cycle ascending → descending → unsorted with stable client-side ordering and accessible `aria-sort` state. Missing nutrition renders as an em dash. Hover/highlight uses one inherited row surface through the action edge; the action column is part of the normal table flow rather than a separate sticky overlay.

On small screens, the same data becomes card-like rows: favorite, name, add action, station/dietary metadata, and a four-cell Cal/Pro/Carb/Fat summary. The entire noncontrol row area still opens nutrition details.

### 3.6 Selected-food meal planner

`Selected Foods` is a browser-local planner, not a SQL table. Adding an occurrence snapshots its restaurant, meal, service times, station context, source/variant food ID, nutrition, ingredients, dietary data, and allergen data into `localStorage`. Foods are grouped under a stable `date:restaurant:meal` key. Adding an existing food increases its quantity; quantity controls operate in quarter-serving steps, bounded from 0.25 to 10, and decreasing below 0.25 removes the item.

Each planned group shows the source meal name, restaurant, time window, food names, and quantity-adjusted calories. Controls remove one food, a whole meal, or all items for the selected date. The selected-count badge and add buttons provide short checkmark/pulse feedback.

`Export CSV` emits one row per planned food with date; restaurant/meal/station and opening/closing times; internal variant and encoded source IDs; short/full names; quantity and serving size; per-serving and selected calories, protein, carbs, fat, and sodium; dietary flags and positive allergen names; ingredients; meal totals; whole-plan totals; and total selected quantity. CSV quoting is applied to commas, quotes, and line breaks.

### 3.7 Nutrition Insights visualizations

The Nutrition Insights panel has four chart-like views followed by three ranked/coverage lists. Empty states are explicit when the required nutrition or station data does not exist. The nutrition-insights API still returns date-wide `proteinScatter` and `macroFoods` arrays for API consumers, but the current page intentionally does not render those two arrays: its point charts are rebuilt from the selected restaurant menu and filtered to the active meal. Separate campus-wide `proteinEfficiency`, `sodiumOutliers`, and `constraintCoverage` arrays supply the three lists.

#### Protein Value Scatter — selected restaurant **and** selected meal

This interactive scatter uses every unique food-variant ID in the current restaurant/meal with both calories and protein greater than zero. Calories determine horizontal position and protein determines vertical position, each normalized to that meal's maximum with plot-edge padding. Points are native button elements positioned over a CSS plot rather than a charting library; selecting one opens its nutrition drawer. Vegan, vegetarian, and omnivore groups use three point colors, with mouse/keyboard labels and accessible food/calorie/protein names. For this chart-color grouping, any item not explicitly marked vegan or vegetarian—including an unknown dietary state—falls into the `Omnivore` display group; this is a visual bucket, not an additional source claim.

Foods with identical or nearly identical coordinates are spread in small golden-angle offsets (137.5° with a capped radius) so one point does not completely hide another. The subtitle names the active source meal/time label and the exact plotted food count.

#### Macro Triangle — selected restaurant **and** selected meal

This ternary/barycentric plot compares macro calorie composition for every current-meal variant with a positive macro-calorie total. Protein and carbohydrate grams are converted at 4 calories/gram and fat at 9 calories/gram. The three shares place the point between Protein, Carbs, and Fat vertices on a native SVG triangle, while the actual points remain interactive HTML buttons. Point color, collision spreading, labels, keyboard access, drawer behavior, meal subtitle, and exact count parallel the scatter plot.

#### Station Constraint Heatmap — selected restaurant and meal

Each row is a station in the active meal; columns are Vegetarian, Vegan, GF, No Top-9, Milk Free, Wheat Free, Soy Free, and Egg Free. Each cell is the share of the station's distinct variants meeting that constraint, rounded to three decimals in the API and shown as a whole percentage. Color is generated continuously from a light warm/red hue for fewer choices to a darker green hue for more choices. Cells expose the exact station/constraint/percentage on hover, focus, and tap.

`No Top-9` counts only foods for which all nine allergen flags are explicitly false. Individual free-from shares likewise require explicit false values, so unknown source allergen information cannot inflate safety coverage.

#### Station Macro Fingerprints — selected restaurant and meal

Each station row shows its average protein in grams and a 100%-width stacked bar for aggregate protein-, carbohydrate-, and fat-derived calories. The API sums each macro's calorie contribution across the station's distinct food variants, normalizes the three shares, and the browser renders the result in the shared macro colors. This is a compact composition comparison rather than a total-volume bar chart.

#### Top Protein Efficiency — campus-wide for the selected date

The API ranks variants with positive calories and protein by `protein grams / calories × 100`, breaking ties by protein descending and calories ascending. It returns eight; the current list displays the first six with rank, food/context, and exact grams per 100 calories. Rows open the nutrition drawer.

#### Sodium Outliers — campus-wide for the selected date

Candidates require positive sodium and calories. The backend ranks them with a composite density/absolute score: 70% from sodium per 100 calories plus 30% from absolute sodium capped at 1,800 mg and scaled by 18. It returns ten; the page displays the first six with source context, absolute sodium, calories, and a badge containing sodium per 100 calories. Rows open the drawer.

#### Constraint Coverage — campus-wide for the selected date

The backend calculates eight date-wide shares—Vegetarian, Vegan, Gluten free, No top-9 allergens, Milk free, Wheat free, Soy free, and Egg free—over distinct placed food variants. The current UI displays the first six. Each row shows count/total, a horizontal percentage meter, and a green/gold/neutral badge based on 45% and 25% thresholds.

### 3.8 Nutrition details drawer

Selecting a food from a menu row, overview, search result, chart point, ranking, or favorite opens a fixed right-side drawer. Its header is pinned inside the scroll container so the food name, fuller identifying line, and close button remain visible throughout scrolling.

The body displays:

- source dietary/additional-attribute and allergen-state badges;
- a four-cell Calories/Protein/Carbs/Fat summary;
- serving amount/unit, description, and ingredients, with explicit “Not published” language for missing source values;
- a clean semantic nutrition-facts table with separate **Nutrient**, **Amount**, and **Daily value** columns. It preserves source order and secondary-row styling, displays source units and `%DV`, and uses an em dash for unpublished values;
- a compatibility fallback fact table from scalar columns if an older food has no child fact rows;
- a warning when Elon hid allergen data, plus the source disclaimer when present;
- local Favorite and Add to plan actions.

The drawer distinguishes `NULL` from zero in its detail/fact presentation. Its title remains attached to the food while the facts scroll.

### 3.9 Global search dialog

The modal search experience covers the entire selected service date, not only the open restaurant. Each result shows food name, restaurant and station, meal/source service label and exact window, dietary badges, calories, protein, and an add button. Clicking the main result selects its restaurant, meal, and station, highlights the matching menu occurrence, and brings that row into view; the add button can plan it directly.

The dialog supports arrow-key result movement, Enter to reveal, Escape to close, a focus trap, and mouse-hover active selection. Search results retain occurrence context, so the same food variant at different stations/meals can appear as distinct result rows.

### 3.10 Favorites, settings, footer, and persistence

- **Favorites panel.** Shows up to eight locally saved foods with refreshed date/context data when the same variant is available in the current date-wide food response. Each row shows food/context, calories, protein, and controls to open, unfavorite, or add it. If no current match exists, the saved snapshot remains usable.
- **Nutrition Goals dialog.** Edits bounded calorie/protein/carbohydrate/fat goals, traps focus, restores prior focus on close, and can reset the entire local profile (goals, planner, favorites, and safety preferences) to defaults.
- **Footer.** `Database last updated` uses the maximum valid successful-import timestamp across the service-date summaries, formats it to month/day/year plus hour and minute in America/New_York, and explicitly labels it `ET`. It also displays `Created By Chadd Brenner`, with the name linked to `https://chadd.blog/`.
- **Local-only state.** The profile (goals, safety filters, favorites, planned meals, timestamps), theme, and visible table columns use versioned `localStorage` keys. The server never receives this user state.

### 3.11 Responsive and accessibility techniques

The interface uses semantic tables where the content is tabular, native buttons for interactive chart points, ARIA tab/listbox/dialog/sort states, keyboard navigation for restaurant and meal tabs, visible focus handling, dialog focus traps, and descriptive labels for heatmap cells and chart points. Desktop tables become purpose-built compact rows on mobile, the planner grid collapses, overview becomes the default menu mode, and dense insight grids stack at responsive breakpoints. Loading, no-data, unknown-nutrition, and link-only-resource cases all have text fallbacks rather than depending on color or geometry alone.

## Verification scope

The final review for this document covers:

- collection and parsing: `scraper/elon_scraper/parser.py` and `scraper/elon_scraper/cli.py`;
- validation and persistence: `scraper/elon_scraper/importer.py`;
- relational storage: `db/init/001_schema.sql`, `db/init/002_seed.sql`, and `db/migrations/005_nullable_food_unknowns.sql` through `006_source_fidelity_and_food_variants.sql`;
- API contracts and derived analytics: `backend/src/app.js`, `backend/src/repositories/menuRepository.js`, and `backend/src/validation.js`;
- browser data contracts and presentation: `frontend/src/types.ts`, `frontend/src/App.tsx`, `frontend/src/app/utils.ts`, and every component under `frontend/src/components/`;
- automated contract coverage: backend, scraper, frontend unit, and Playwright end-to-end tests.
