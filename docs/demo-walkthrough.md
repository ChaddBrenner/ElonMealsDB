# Portfolio Demo Walkthrough

This walkthrough is designed for a short portfolio review. It shows the user-facing app first, then proves the backend, SQL model, scraper import flow, Docker deployment, and security boundaries.

## 1. Start The Stack

```bash
cp .env.example .env
# Replace every change-me password in .env before hosting publicly.
docker compose up -d --build --wait --wait-timeout 180
```

Open:

```text
http://localhost:8080
```

What to point out:

- The only published container port is the frontend on loopback-bound `127.0.0.1:8080`.
- The frontend proxies `/api` to the backend over the private Compose network.
- MySQL is internal-only and is not exposed to the host.

Quick proof:

```bash
docker compose ps
curl -fsS http://localhost:8080/healthz
curl -fsS http://localhost:8080/api/ready
```

## 2. Show The Product Workflow

In the dashboard:

1. Pick a service date.
2. Choose a restaurant.
3. Search for a food.
4. Open the nutrition drawer.
5. Favorite the food.
6. Add it to today's plan.
7. Adjust the quantity and show the macro totals updating.

What to point out:

- Personal planning data stays in browser storage, so the public API remains read-only.
- The app still has real planner workflows: imported-date browsing, favorites, meal plans, nutrition goals, history, filters, SQL-backed nutrition insights, and a nutrition drawer.
- API text is rendered as plain React text; no HTML injection path is needed for menu data.

## 3. Show The SQL/System Proof Panel

Click `System` in the sidebar.

What to point out:

- The UI exposes the normalized path: `Restaurants -> Meals -> Stations -> Foods`.
- The panel displays current import status and indexed food counts from live API data.
- The Data Freshness panel shows imported service dates and recent scraper import runs from `scraper_runs`, including failed or partial runs.
- The Nutrition Insights panel shows aggregate dietary coverage and top-protein foods backed by SQL ranking queries.
- Station Compare shows station-level averages from a grouped SQL aggregate across restaurants, meals, stations, station-food rows, and foods.
- The dashboard distinguishes distinct menu foods from scraper food appearances, which demonstrates the many-to-many station-food model.
- The SQL examples are served from `/api/sql-proof`, so the frontend is showing the backend contract instead of a static screenshot.

API proof:

```bash
curl -fsS http://localhost:8080/api/sql-proof
curl -fsS "http://localhost:8080/api/metrics/coverage"
curl -fsS "http://localhost:8080/api/import-runs?limit=6"
```

## 4. Prove The Relational Model Directly

Open a read-only MySQL shell as the API user:

```bash
docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_API_PASSWORD" mysql -u"$MYSQL_API_USER" "$MYSQL_DATABASE"'
```

Run a hierarchy join:

```sql
SELECT
  DATE_FORMAT(r.service_date, '%Y-%m-%d') AS service_date,
  r.name AS restaurant,
  m.name AS meal,
  DATE_FORMAT(m.time_open, '%H:%i') AS opens_at,
  s.name AS station,
  COUNT(sf.food_id) AS foods_at_station
FROM restaurants r
JOIN meals m ON m.restaurant_id = r.id
JOIN stations s ON s.meal_id = m.id
JOIN station_foods sf ON sf.station_id = s.id
GROUP BY r.service_date, r.name, m.name, m.time_open, s.name
ORDER BY r.service_date DESC, r.name, m.time_open, s.name
LIMIT 12;
```

Run a nutrition ranking:

```sql
SELECT
  f.short_name,
  ROUND(f.protein, 1) AS protein_g,
  ROUND(f.calories, 0) AS calories,
  GROUP_CONCAT(DISTINCT s.name ORDER BY s.name SEPARATOR ', ') AS stations
FROM foods f
JOIN station_foods sf ON sf.food_id = f.id
JOIN stations s ON s.id = sf.station_id
GROUP BY f.id, f.short_name, f.protein, f.calories
ORDER BY f.protein DESC, f.calories ASC
LIMIT 10;
```

What to point out:

- API queries use parameterized SQL through `mysql2/promise`.
- Dynamic allergen filters are constrained to a server-side allowlist of known columns.
- The API database user can read but cannot mutate tables.

Read-only proof:

```bash
docker compose exec -T backend node --input-type=module -e "import { pool } from './src/db.js'; try { await pool.query('DELETE FROM scraper_runs WHERE id = -1'); process.exit(1); } catch (error) { console.log(error.code); process.exit(0); } finally { await pool.end(); }"
```

Expected output:

```text
ER_TABLEACCESS_DENIED_ERROR
```

## 5. Show The Scraper And Scheduler

One-shot import:

```bash
docker compose --profile scraper run --rm scraper
```

Recurring scheduler:

```bash
docker compose up -d --build
docker compose logs --tail=80 scraper-scheduler
```

What to point out:

- The scheduler is the Docker-managed equivalent of a cron job.
- It imports today and tomorrow by default at `05:15` and `15:15` America/New_York time.
- Web users cannot trigger imports; scraper writes happen only through private operator-run containers.
- Failed scheduled imports are recorded in `scraper_runs` and the scheduler continues to the next run.

Audit trail proof:

```sql
SELECT
  id,
  status,
  DATE_FORMAT(target_date, '%Y-%m-%d') AS target_date,
  started_at,
  finished_at,
  restaurants_count,
  meals_count,
  foods_count,
  error_message
FROM scraper_runs
ORDER BY id DESC
LIMIT 8;
```

## 6. Security Talking Points

Useful checks:

```bash
curl -i -sS http://localhost:8080/api/restaurants/1%20OR%201=1/menu
curl -i -sS 'http://localhost:8080/api/foods?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E'
printf '{"bad"' | curl -i -sS -X POST http://localhost:8080/api/foods -H 'Content-Type: application/json' --data-binary @-
curl -i -sS -X POST http://localhost:8080/api/planner/meals -H 'Content-Type: application/json' -d '{"foodId":1,"quantity":1}'
```

What to point out:

- Invalid IDs and script-shaped search input are rejected before database access.
- Malformed JSON returns a structured `400` instead of a stack trace.
- Planner mutation routes do not exist because personal planner state is local-first.
- Public backend traffic uses a read-only database account.
- The backend has strict body limits, Helmet, rate limiting, CORS allowlisting, structured errors, and no public upload surface.

## 7. Final Verification Commands

Before publishing or demoing:

```bash
npm run verify
npm run verify:docker
```

## Skills This Project Demonstrates

- Relational schema design and multi-table SQL joins.
- Parameterized API query design with validation at the boundary.
- Docker Compose deployment with private networks, health checks, and least-privilege service accounts.
- Scraper design that separates external fetch/import jobs from public request handling.
- Security-focused public API design with no upload surface and no public write routes.
- React/Vite frontend engineering with accessible controls, responsive layouts, local-first persistence, and browser-tested workflows.
