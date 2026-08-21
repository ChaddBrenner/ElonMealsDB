# Scraper source contract

This document records the public Elon Dining data surfaces inspected on August 21, 2026 and the invariants the importer relies on. It is intentionally separate from the parser implementation so source assumptions can be reviewed when the dining site changes.

## Network and API findings

Chrome DevTools showed that both the historical menu-hours page and individual location menu pages are server rendered. Loading a location such as Lakeside Dining Hall made one document request and no XHR or Fetch requests. The complete menu, station, recipe, dietary, allergen, and nutrition payload was present in that HTML response.

The WordPress API index publishes a custom `nmc-menu/v2` namespace:

| Resource | Observed result | Suitability |
| --- | --- | --- |
| `/wp-json/` | Public API index, HTTP 200 | Useful for endpoint discovery |
| `/wp-json/nmc-menu/v2/open-now` | WordPress critical-error page, HTTP 500 | Not reliable or date-addressable |
| `/wp-json/nmc-menu/v2/display/{id}` | HTTP 200, but a location WordPress post ID returned an empty array | Appears intended for a separate display system |
| `/wp-content/themes/nmc_dining/ajax-content/open-now.php` | JSON with current time plus currently open location title, link, and logo | Useful only as optional real-time corroboration; it has no historical date or menu data |
| `/wp/v2/types` | Standard WordPress types only | The custom location post type is not REST-exposed |

The public JavaScript also references a legacy per-recipe PHP endpoint, but that endpoint returned a WordPress critical-error page during testing. Current location pages already contain a richer JSON object for every recipe, so the collector does not depend on the legacy endpoint.

There is therefore no working public API that provides historical location hours and menus. The least presentation-dependent public contract available is:

1. Server-rendered `data-open`, `data-close`, and `data-name` attributes on `/menu-hours/?date=YYYY-MM-DD`.
2. Server-rendered meal tab identifiers and station identifiers on each same-origin `/locations/.../?date=YYYY-MM-DD` page.
3. Embedded JSON objects keyed by stable, base64-encoded recipe identifiers for nutrition, ingredients, allergens, and dietary attributes.

## Resource scope

Every resource with a valid hours row on Elon Dining's menu-hours page enters the import payload. Menu collection remains deliberately narrower: only resources whose final URL remains on `elondining.com` or `www.elondining.com` and whose path begins with `/locations/` are fetched and parsed for structured food data.

- Direct external links retain their source-authored service labels, times, and exact outbound URL, and are never fetched.
- Same-origin links that redirect off-site are stopped before the external target is fetched; their hours remain and the final redirect target is retained as the outbound URL.
- Direct and redirected PDF resources retain their hours and document URL but are not parsed as structured menus.
- Same-origin location pages that publish hours but no menu tabs remain valid `hours_only` locations.

This means the August 21 payload contains all eight source resources and all eleven service windows. Biscuitville and Freshii are classified as external resources with link-only menu states; the other six are Elon-owned location resources.

## Collection invariants

A payload is marked `complete` only after all of these checks pass:

- The menu-hours document's `#full-date` exactly matches the requested Eastern service date.
- At least one resource with a valid service window is present.
- Opening timestamps start on the requested date, closing timestamps follow opening timestamps, and a window is no longer than 24 hours.
- Duplicate location names or URLs are rejected.
- Only Elon-owned location pages are fetched; an off-site or PDF redirect is stopped before its target body is requested and converted to a link-only resource.
- Every location page has the expected WordPress location structure, identity, and target-date timestamp.
- The hours-page location and venue identities match the location document.
- Meal-tab labels and content-panel counts agree; `data-tabid` values are unique and in range.
- Menu tabs are joined to service windows by normalized meal name, not by position across two different documents.
- Every rendered menu item has a recipe identifier and valid embedded nutrition JSON. Items are never silently dropped.
- Reported restaurant, meal, station, distinct-recipe, food-variant, and menu-placement counts equal counts recomputed from the completed hierarchy.

Requests use a persistent session, explicit timeouts, limited connection pooling, `Retry-After` support, and exponential retries for transient connection/read failures plus HTTP 408, 425, 429, and common 5xx responses.

The importer recognizes verified source contract version 4. A verified payload may contain `hours_only`, `external`, `pdf`, `not_published`, or structurally valid `empty_menu` meals. Older/unverified payloads retain the conservative legacy behavior and are rejected if any meal is empty.

## Extracted fields

In addition to the database's existing scalar nutrition fields, collection JSON now preserves:

- WordPress location post IDs and canonical location URLs.
- Location, meal, and current-hours statuses.
- Source meal-tab and station identifiers.
- Decoded numeric recipe IDs alongside the original stable encoded IDs.
- The full ordered nutrition-facts collection with units, percentage daily values, and secondary-row flags.
- Added sugars, potassium, calcium, iron, and vitamin D scalar values when published.
- Dietary attribute keys and names, including `Coolfood` and other attributes beyond vegan/vegetarian/gluten-free.
- The source allergen disclaimer and `hideAllergens` flag.
- Searchable source terms.

The relational schema persists these fields. Ordered facts and arbitrary dietary attributes use child tables, while common nutrition values remain indexed scalar columns for search and analytics.

Recipe identifiers are treated as source identifiers, not globally stable nutrition identities. Each food record is keyed by the encoded recipe ID plus a deterministic hash of the full source content. A source recipe can therefore retain multiple context-correct nutrition/allergen variants without last-write-wins corruption. Import and API metrics separately report distinct recipe IDs, content variants, and station-menu placements.

## Operational interpretation

An hours-only, external-link, or PDF location is expected source behavior, not a partial scrape. A failed structural, identity, date, network, nutrition-JSON, or count invariant is a collector failure and must not replace an existing date. Warnings such as an advertised meal without a matching published menu tab are included in the successful import summary and scheduler logs.
