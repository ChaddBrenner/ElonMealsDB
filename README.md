# ElonMealsDB

ElonMealsDB is a full-stack dining planner I built around a MySQL database and scraper I originally built in undergrad. It scrapes Elon Dining menu data, imports it into a relational model, and turns it into a React dashboard for searching foods, comparing stations, checking nutrition, and planning a meal.

Personal planning data stays in the user's browser: favorites, selected foods, nutrition goals, and safety preferences are stored locally instead of requiring accounts or server-side user records. The backend is read-only for public web traffic and focuses on menu data, search, coverage metrics, and scraper-backed imports run by the operator.

This is an independent portfolio project. It is not affiliated with, endorsed by, or sponsored by Elon University or Elon Dining. Menu and nutrition data can change; users should verify current dining information with the official dining provider, especially for allergen or medical decisions.

## Quick Start

```bash
cp .env.example .env
# Edit .env and replace every change-me password before publishing.
docker compose up --build
```

Open `http://localhost:8080`.

The frontend is bound to `127.0.0.1:8080` by default so it is ready to sit behind a local HTTPS reverse proxy, for example Caddy.

On first run, the dashboard chooses today's imported menu when available and otherwise falls back to the newest bundled sample date. Run the scraper import below to refresh MySQL with live Elon Dining data.

![ElonMealsDB dashboard](docs/screenshots/dashboard-desktop.png)

Mobile view:

![ElonMealsDB mobile dashboard](docs/screenshots/dashboard-mobile.png)

Useful checks:

```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/api/health
curl "http://localhost:8080/api/restaurants?date=2026-07-01"
```

## Stack

- Frontend: React, Vite, TypeScript
- Backend: Node.js, Express, `mysql2/promise`, Zod, Helmet
- Database: MySQL 8.4 schema plus deterministic sample menu data
- Scraper: Python using Beautiful Soup, Requests, and PyMySQL
- Deployment: Docker Compose behind an HTTPS reverse proxy
- DB privilege model: read-only API user plus separate limited scraper writer user

## Architecture

```mermaid
flowchart LR
  Browser["Browser"] --> Frontend["frontend nginx"]
  Frontend --> Backend["backend Express API"]
  Backend --> MySQL["mysql"]
  Scraper["optional scraper profile"] -. "reviewed import path" .-> MySQL
  Scheduler["default scheduler service"] -. "daily imports" .-> MySQL
```

For a deeper read, use [docs/sql-walkthrough.md](docs/sql-walkthrough.md) for the relational model and [docs/portfolio-case-study.md](docs/portfolio-case-study.md) for the portfolio writeup. Production and security notes live in [docs/deployment.md](docs/deployment.md).

## SQL

This needed a real database because the data is naturally one-to-many and many-to-many. The app uses SQL for the parts where a relational database actually makes sense:

- Restaurant -> meal -> station -> food hierarchy joins.
- Many-to-many station food appearances, so the same food can show up in different places without duplicating nutrition facts.
- Dietary and allergen filtering with validated request parameters.
- Station-level aggregates for average calories, protein, and safe-option counts.
- Nutrition rankings such as protein per 100 calories and high-sodium outliers.
- Import audit trails through `scraper_runs`, so freshness is queryable instead of just implied by logs.

The SQL examples in [docs/sql-walkthrough.md](docs/sql-walkthrough.md) can be run against the local Docker database, and `/api/sql-proof` exposes fixed example queries for a quick code review.

## Interesting Features

I like trying new technologies and refreshing myself on older ones, so even though this is a small project, it has more real architecture than a simple static demo.

- Relational design for restaurants, meals, stations, foods, and scraper run metadata.
- SQL joins, aggregates, station-level nutrition comparison, nutrition ranking, and import audit trails across the full menu hierarchy.
- Secure API defaults: request validation, rate limits, parameterized queries, structured errors, no stack traces in responses.
- Docker-first deployment with private DB networking.
- A frontend that works like an app: imported-date browsing, local favorites, a dated meal planner, station comparison, nutrition insights, CSV export, responsive tables, and a detail drawer.
- React frontend with feature-oriented modules for timeline, planner, menu controls, food views, insights, panels, shared utilities, and scoped stylesheet sections.

## Self-Hosting

I self-host the app as Docker containers behind Caddy and Cloudflare Tunnel. The public tunnel reaches the frontend through the reverse proxy, while the backend, MySQL, scraper, and scheduler stay on the private Docker network. The default local Compose setup mirrors that shape by publishing only the frontend on `127.0.0.1:8080`.

For website or resume positioning, use [docs/portfolio-case-study.md](docs/portfolio-case-study.md).

## Scraper Imports

The scraper is an explicit private job, not a public web action. Run a one-shot import for today and tomorrow:

```bash
docker compose --profile scraper run --rm scraper
```

The recurring scheduler starts with the normal Compose stack. This is the Docker equivalent of a cron job: it travels with the app, runs privately on the internal network, and uses the scraper database account instead of exposing any public import endpoint.

```bash
docker compose up -d --build --remove-orphans
```

By default it imports once at container startup, then imports today and tomorrow at `05:15` and `15:15` America/New_York time. Adjust `.env` with:

```bash
SCRAPER_RUN_TIMES=05:15,15:15
SCRAPER_DAYS_AHEAD=1
SCRAPER_RUN_ON_START=true
```

The scheduler records failed import attempts in `scraper_runs` and keeps running, so transient Elon Dining or network issues do not permanently stop future scheduled imports.

Check the current scheduler state:

```bash
docker compose logs --tail=80 scraper-scheduler
docker compose ps scraper-scheduler
```

For local parser development:

```bash
python -m pip install -r scraper/requirements-dev.txt
PYTHONPATH=scraper pytest scraper/tests
PYTHONPATH=scraper python -m elon_scraper.cli collect --date 2026-07-01 --max-restaurants 1
PYTHONPATH=scraper DB_HOST=127.0.0.1 DB_NAME=elon_meals DB_USER=elon_scraper DB_PASSWORD=... python -m elon_scraper.cli import-db --date 2026-07-01
```

If you change database usernames/passwords after a Docker volume already exists, re-apply grants without wiping data:

```bash
docker compose exec -T mysql sh -c '/docker-entrypoint-initdb.d/003_least_privilege_users.sh'
```

## Development

```bash
npm install
python -m pip install -r scraper/requirements-dev.txt
npx playwright install chromium
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Full local verification before publishing:

```bash
npm run verify
npm run verify:docker
```

`npm run verify` runs typechecks, tests, e2e, build, dependency audits, scraper tests, Compose config validation, and a secret hygiene check. `npm run verify:docker` also starts the Docker stack with scheduler startup imports disabled, checks health/API readiness, confirms only the loopback frontend port is published, confirms missing hashed assets return 404 instead of the SPA fallback, confirms the scheduler is running, and verifies that the backend database user cannot write. If `.env` is not present, the verifier uses `.env.example` for Compose checks.

Run the backend and frontend separately during UI work:

```bash
npm --workspace @elon-meals-db/backend run dev
npm --workspace @elon-meals-db/frontend run dev
```

## Security

Read [docs/deployment.md](docs/deployment.md) before self-hosting. In short:

- Put the app behind HTTPS.
- Change the passwords in `.env`.
- Do not expose MySQL publicly.
- Keep the backend on the read-only `MYSQL_API_USER`; only the scraper/scheduler should use the writer account.
- Do not expose the backend directly unless your reverse proxy preserves the intended CORS and rate-limit behavior.
- Keep scraper/import workflows private and operator-triggered.

## License

GNU Affero General Public License v3.0 only (`AGPL-3.0-only`). See [LICENSE](LICENSE).
