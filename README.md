# ElonMealsDB

ElonMealsDB is a full-stack dining planner I built around a normalized MySQL database. It takes Elon Dining menu data, imports it into a relational model, and turns it into a React dashboard for searching foods, comparing stations, checking nutrition, and planning a meal.

Personal planning data stays in the user's browser: favorites, selected foods, nutrition goals, and safety preferences are stored locally instead of requiring accounts or server-side user records. The backend is intentionally read-only for public traffic and focuses on normalized menu data, search, coverage metrics, and scraper-backed imports run by the operator.

This is an independent student/portfolio project. It is not affiliated with, endorsed by, or sponsored by Elon University or Elon Dining. Menu and nutrition data can change; users should verify current dining information with the official dining provider, especially for allergen or medical decisions.

## Quick Start

```bash
cp .env.example .env
# Edit .env and replace every change-me password before publishing.
docker compose up --build
```

Open `http://localhost:8080`.

The frontend is bound to `127.0.0.1:8080` by default so it is ready to sit behind a local HTTPS reverse proxy. Change `FRONTEND_BIND` only if you intentionally want Docker to listen on another host interface.

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

- Frontend: React, Vite, TypeScript, nginx static container
- Backend: Node.js, Express, `mysql2/promise`, Zod, Helmet
- Database: MySQL 8.4 schema plus deterministic sample menu data
- Scraper/search: Python CLI parsing current Elon Dining embedded nutrition JSON plus local FastEmbed semantic vectors
- Deployment: Docker Compose behind your own HTTPS reverse proxy
- DB privilege model: read-only API user plus separate limited scraper writer user

## Architecture

```mermaid
flowchart LR
  Browser["Browser"] --> Frontend["frontend nginx"]
  Frontend --> Backend["backend Express API"]
  Backend --> MySQL["mysql"]
  Backend -. "semantic search" .-> Embedder["embedder FastEmbed"]
  Scraper["optional scraper profile"] -. "reviewed import path" .-> MySQL
  Scheduler["default scheduler service"] -. "daily imports" .-> MySQL
```

See [docs/architecture.md](docs/architecture.md) for the system design, [docs/sql-walkthrough.md](docs/sql-walkthrough.md) for runnable SQL examples, [docs/demo-walkthrough.md](docs/demo-walkthrough.md) for a short demo path, and [docs/portfolio-case-study.md](docs/portfolio-case-study.md) for project notes.

## Why SQL Is Central Here

I wanted this to be more than a frontend wrapped around a JSON file. The app uses SQL for the parts where a relational database actually makes sense:

- Restaurant -> meal -> station -> food hierarchy joins.
- Many-to-many station food appearances, so the same food can show up in different places without duplicating nutrition facts.
- Dietary and allergen filtering with validated request parameters.
- Station-level aggregates for average calories, protein, and safe-option counts.
- Nutrition rankings such as protein per 100 calories and high-sodium outliers.
- Import audit trails through `scraper_runs`, so freshness is queryable instead of just implied by logs.

The SQL examples in [docs/sql-walkthrough.md](docs/sql-walkthrough.md) can be run against the local Docker database, and `/api/sql-proof` exposes fixed example queries for a quick code review.

## What This Project Shows

- Normalized relational design for restaurants, meals, stations, foods, and scraper run metadata.
- SQL joins, aggregates, station-level nutrition comparison, nutrition ranking, and import audit trails across the full menu hierarchy.
- Secure API defaults: request validation, rate limits, parameterized queries, structured errors, no stack traces in responses.
- Docker-first deployment with private DB networking and non-root application containers.
- A frontend that works like an app: imported-date browsing, local favorites, a dated meal planner, station comparison, nutrition insights, CSV export, responsive tables, and a detail drawer.
- A decomposed React frontend with feature-oriented modules for timeline, planner, menu controls, food views, insights, panels, shared utilities, and scoped stylesheet sections.

## Self-Hosting

I self-host the app as Docker containers behind Caddy and Cloudflare Tunnel. The public tunnel reaches the frontend through the reverse proxy, while the backend, MySQL, scraper, scheduler, and embedder stay on the private Docker network. The default local Compose setup mirrors that shape by publishing only the frontend on `127.0.0.1:8080`.

For a short reviewer walkthrough, use [docs/demo-walkthrough.md](docs/demo-walkthrough.md).

For website or resume positioning, use [docs/portfolio-case-study.md](docs/portfolio-case-study.md).

## Scraper Imports

The scraper is an explicit private job, not a public web action. Run a one-shot import for today and tomorrow:

```bash
docker compose --profile scraper run --rm scraper
```

The recurring scheduler starts with the normal Compose stack. This is the Docker equivalent of a cron job: it travels with the app, runs privately on the internal network, and uses the scraper database account instead of exposing any public import endpoint.

```bash
docker compose up -d --build
```

By default it imports once at container startup, then imports today and tomorrow at `05:15` and `15:15` America/New_York time. Adjust `.env` with:

```bash
SCRAPER_RUN_TIMES=05:15,15:15
SCRAPER_DAYS_AHEAD=1
SCRAPER_RUN_ON_START=true
```

The scheduler records failed import attempts in `scraper_runs` and keeps running, so transient Elon Dining or network issues do not permanently stop future scheduled imports. One-shot `import-db` still exits nonzero after recording the failure.

Check the current scheduler state:

```bash
docker compose logs --tail=80 scraper-scheduler
docker compose ps scraper-scheduler
```

Refresh semantic search vectors for an already imported date:

```bash
docker compose --profile scraper run --rm scraper python -m elon_scraper.cli refresh-embeddings --date 2026-07-01
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

Read [docs/deployment.md](docs/deployment.md), [docs/security.md](docs/security.md), and the latest [security audit notes](docs/security-audit.md) before self-hosting. In short:

- Put the app behind HTTPS.
- Change the passwords in `.env`.
- Do not expose MySQL publicly.
- Keep the backend on the read-only `MYSQL_API_USER`; only the scraper/scheduler should use the writer account.
- Do not expose the backend directly unless your reverse proxy preserves the intended CORS and rate-limit behavior.
- Keep scraper/import workflows private and operator-triggered.

## API

See [docs/api.md](docs/api.md) for example API calls.

## License

MIT. See [LICENSE](LICENSE).
