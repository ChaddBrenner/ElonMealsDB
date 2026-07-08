# Security Notes

This project is designed for public self-hosting with a read-only menu API and browser-local personal planning state.

The latest repeatable audit notes are in [security-audit.md](security-audit.md). Production setup guidance is in [deployment.md](deployment.md).

ElonMealsDB is an independent project and is not affiliated with or endorsed by Elon University or Elon Dining. Treat scraped dining data as convenience data, not medical or contractual guidance. Users should verify allergens, ingredients, hours, and availability with the official dining provider.

## Public Attack Surface

- `frontend` exposes `127.0.0.1:8080` by default for a same-host HTTPS reverse proxy.
- `backend` is only reachable inside the Compose network through `/api`.
- `mysql` has no host port mapping.
- `scraper` only runs through the explicit `scraper` Compose profile.
- `scraper-scheduler` runs by default but stays private on the internal Compose network.

## Input Policy

- Public API routes are read-only.
- User favorites, selected foods, safety preferences, and nutrition goals are stored in browser storage instead of being uploaded to the server.
- The frontend renders API text as plain React text and does not use HTML injection sinks.
- The API does not expose arbitrary SQL/query execution.
- SQL never uses dynamic table names, column names, or order clauses from requests.
- Search text is length-limited and allowlisted.
- IDs, dates, and filters are validated with Zod.
- Request JSON is limited by `BODY_LIMIT` and defaults to `8kb`.

## Backend Controls

- `helmet` security headers.
- CORS allowlist through `CORS_ORIGINS`.
- API rate limits through `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX`.
- Structured JSON errors without stack traces.
- MySQL access uses `mysql2/promise` prepared statements and named placeholders.
- Planner write operations are intentionally absent from the public backend.
- The backend uses the read-only `MYSQL_API_USER` account. Scraper imports use a separate `MYSQL_SCRAPER_USER` account limited to `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on the application schema.

## Container Controls

- Pinned base images in Dockerfiles and Compose.
- Non-root runtime users.
- Dropped Linux capabilities on application services. MySQL uses `cap_drop: ALL` plus the small init-time capability set needed by the official image to switch users and initialize the data directory.
- `no-new-privileges` set on application services.
- Read-only filesystems for frontend, backend, and scraper where practical.
- MySQL data lives in a named Docker volume and stays on the private network.
- `db/init/003_least_privilege_users.sh` applies the API/scraper grant split during first bootstrap and can be re-run against an existing volume after credential rotation.

## Deployment Expectations

Run this behind a TLS reverse proxy such as Caddy, nginx, Traefik, or Cloudflare Tunnel. Keep `.env` private, rotate default passwords before hosting, and avoid exposing the backend or database ports directly. Leave `FRONTEND_BIND=127.0.0.1` unless another private proxy topology requires a broader bind. See [deployment.md](deployment.md) for a concrete production checklist.

## Manual Abuse Checklist

- Try malformed IDs such as `/api/restaurants/1%20OR%201=1/menu`.
- Try unsafe search text such as `<script>alert(1)</script>`.
- Try removed write routes such as `POST /api/planner/meals` and confirm they return `404`.
- Try oversized JSON bodies.
- Confirm `/api/sql-proof` only returns fixed examples.
- Confirm no endpoint runs scraper imports.
- Confirm recurring imports run as the private `scraper-scheduler` service and no public route can trigger them.
- Confirm `docker compose ps` shows only frontend has a host port and that it is loopback-bound by default.
- Confirm the backend DB user cannot write: `docker compose exec -T backend node -e "import('./src/db.js').then(async ({pool}) => { try { await pool.query('DELETE FROM scraper_runs WHERE id = -1'); process.exit(1); } catch { process.exit(0); } })"`.
