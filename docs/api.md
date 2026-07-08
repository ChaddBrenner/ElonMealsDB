# API Examples

All public endpoints are read-only and live under `/api`. Errors use a stable JSON shape:

```json
{
  "error": {
    "code": "bad_request",
    "message": "Invalid request input"
  }
}
```

Malformed JSON returns `400 bad_request`; oversized request bodies return `413 payload_too_large`. The default body limit is `8kb`, configured with `BODY_LIMIT`.

Health:

```bash
curl http://localhost:8080/api/health
```

Restaurant coverage for the sample date:

```bash
curl "http://localhost:8080/api/restaurants?date=2026-07-01"
```

`date` must be a real calendar date in `YYYY-MM-DD` format. If omitted, the API uses the newest imported service date.

Available imported service dates:

```bash
curl "http://localhost:8080/api/service-dates"
```

Recent scraper import audit trail:

```bash
curl "http://localhost:8080/api/import-runs?limit=6"
```

`limit` is optional and capped from `1` to `12`. In `scraper_runs`, `foods_count` records imported food appearances across stations/meals. Use coverage metrics for distinct food counts.

Menu hierarchy for a restaurant:

```bash
curl "http://localhost:8080/api/restaurants/1/menu"
```

Food filter backed by a parameterized SQL query:

```bash
curl "http://localhost:8080/api/foods?date=2026-07-01&vegan=true&minProtein=10&allergenFree=milk,egg"
```

When `SEMANTIC_SEARCH_ENABLED=true`, `q` uses a hybrid search path: MySQL FULLTEXT/LIKE boosts exact menu, station, meal, and restaurant matches, while an internal FastEmbed service adds local vector similarity for broader food and ingredient intent. If the embedder is unavailable, the endpoint falls back to the SQL-only search path.

Supported food filters:

| Query param | Validation |
| --- | --- |
| `date` | Optional `YYYY-MM-DD` calendar date |
| `q` | Optional plain-text search, 1-80 chars, allowlisted punctuation |
| `vegan` | Optional `true` or `false` |
| `vegetarian` | Optional `true` or `false` |
| `glutenFree` | Optional `true` or `false` |
| `minProtein` | Optional integer `0`-`200` |
| `maxCalories` | Optional integer `0`-`2000` |
| `allergenFree` | Optional comma list: `egg`, `shellfish`, `soy`, `peanut`, `wheat`, `tree_nut`, `milk`, `sesame`, `fish` |

Station-level nutrition comparison:

```bash
curl "http://localhost:8080/api/metrics/stations?date=2026-07-01"
```

This endpoint groups the normalized restaurant, meal, station, station-food, and food tables by station. It returns food counts, average calories, average protein, and dietary coverage for the top station rows on the selected service date.

SQL proof examples:

```bash
curl "http://localhost:8080/api/sql-proof"
```

Private scraper operations:

```bash
docker compose --profile scraper run --rm scraper
docker compose --profile scraper run --rm scraper python -m elon_scraper.cli refresh-embeddings --date 2026-07-01
docker compose logs --tail=80 scraper-scheduler
```
