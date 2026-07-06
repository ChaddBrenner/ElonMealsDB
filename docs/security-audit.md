# Security Audit

Last verified: 2026-07-06

## Automated Checks

```bash
npm run typecheck
npm test
npm run test:e2e
npm run build
PYTHONPATH=scraper .venv/bin/pytest scraper/tests
npm audit --workspaces --omit=dev
.venv/bin/pip-audit -r scraper/requirements.txt
docker compose config --quiet
docker compose --profile scraper --profile scheduler build
docker compose up -d --build --wait --wait-timeout 180
docker compose --profile scraper run --rm scraper
docker compose --profile scheduler up -d --build
docker compose exec -T backend node --input-type=module -e "import { pool } from './src/db.js'; try { await pool.query('DELETE FROM scraper_runs WHERE id = -1'); process.exit(1); } catch { process.exit(0); } finally { await pool.end(); }"
docker compose ps
git ls-files --cached --others --exclude-standard
```

Results:

- Node typecheck, tests, and production build passed.
- Playwright UI smoke test passed for dashboard load, search, nutrition drawer, favorites, local meal plan, and browser-local persistence.
- Scraper parser and scheduler resilience tests passed.
- CI builds every Docker image, starts the default Compose app with seeded data, checks health/API routes, checks malformed JSON handling, and verifies the backend DB user cannot write.
- `npm audit --workspaces --omit=dev` reported `0` vulnerabilities.
- `pip-audit -r scraper/requirements.txt` reported no known vulnerabilities for the current pinned scraper dependencies.
- Docker app services built and ran healthy.
- One-shot scraper import refreshed MySQL from live Elon Dining data.
- Scheduler profile imported current and next-day live menu data, then waited for the next configured run time. Scheduler tests verify failed dates are recorded and subsequent dates continue.
- Backend connected through the read-only `elon_api` DB account; a write attempt failed with `ER_TABLEACCESS_DENIED_ERROR`.
- MySQL grants were checked: `elon_api` has `SELECT, SHOW VIEW`; `elon_scraper` has `SELECT, INSERT, UPDATE, DELETE`.
- `docker compose ps` showed only `frontend` publishing a host port: `8080`.
- Fresh-copy publish rehearsal passed from the Git-tracked source set in a temporary directory with a new Compose project and MySQL volume. The app built, seeded data, reported healthy services, served `/healthz`, returned `/api/service-dates`, returned `/api/sql-proof`, and published only the frontend host port.
- The tracked-file list excludes `.env`, `.venv`, `node_modules`, build output, test output, and local Playwright artifacts.

## Manual Abuse Checks

```bash
curl -fsS http://localhost:8080/healthz
curl -fsS http://localhost:8080/api/health
curl -fsS http://localhost:8080/api/service-dates
curl -i -sS http://localhost:8080/api/restaurants/1%20OR%201=1/menu
curl -i -sS 'http://localhost:8080/api/foods?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E'
printf '{"bad"' | curl -i -sS -X POST http://localhost:8080/api/foods -H 'Content-Type: application/json' --data-binary @-
curl -i -sS -X POST http://localhost:8080/api/planner/meals -H 'Content-Type: application/json' -d '{"foodId":1,"quantity":1}'
curl -fsS 'http://localhost:8080/api/metrics/coverage?date=2026-07-01'
docker compose --profile scraper run --rm scraper
```

Results:

- Health endpoints returned `ok` / local-first status.
- Service-date endpoint returned imported date summaries without exposing write actions.
- SQL-injection-shaped restaurant ID returned `400` before data access.
- Script-tag search input returned `400` from validation.
- Malformed JSON returned structured `400 bad_request`; oversized JSON is covered by backend integration tests and returns `413 payload_too_large`.
- Removed server-side planner mutation route returned `404`.
- Coverage endpoint returned relational metrics from the imported menu database.
- Scraper ran only as an explicit Docker profile job and wrote live normalized menu data into MySQL.
- Browser QA passed at desktop and mobile widths. The mobile layout converted the food table into card rows and reported no horizontal overflow.

## Source Review

Checked with `rg` for:

- DOM injection sinks: `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `eval`, `new Function`.
- Upload and multipart libraries: `multer`, `formidable`, `busboy`, upload keywords.
- Server-side command/file-write sinks: `child_process`, `exec`, `fs.write`.
- Candidate secrets: OpenAI/GitHub token patterns, password assignments, API key names outside examples/docs.
- Dynamic SQL: query construction, `ORDER BY`, `GROUP BY`, `WHERE`, and template interpolation in backend repositories.

Findings:

- No frontend DOM injection sinks were present.
- No upload stack or public scraper/import trigger was present.
- No candidate committed secrets were found in tracked source; the only password-like matches were placeholders in `.env.example`, documented setup reminders, and shell variables used by the grant script.
- SQL request parameters are validated with Zod and executed through `mysql2/promise` placeholders.
- The only dynamic SQL predicate builder uses fixed predicates plus an allergen column allowlist.
