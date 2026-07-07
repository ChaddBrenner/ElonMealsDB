#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

run_docker=false

for arg in "$@"; do
  case "$arg" in
    --docker)
      run_docker=true
      ;;
    -h|--help)
      cat <<'USAGE'
Usage: scripts/verify-public.sh [--docker]

Runs the local public-readiness checks for ElonMealsDB.

Default checks:
  - Node typecheck, unit tests, Playwright e2e, production build
  - Python scraper tests
  - Node and Python dependency audits
  - Docker Compose configuration validation
  - Secret hygiene check that .env is not tracked

With --docker:
  - Rebuilds and starts the Compose stack with SCRAPER_RUN_ON_START=false
  - Verifies frontend health, backend readiness, service dates
  - Verifies only the frontend publishes 127.0.0.1:8080
  - Verifies scraper-scheduler is running
  - Verifies the backend database user cannot write
USAGE
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

step() {
  printf '\n==> %s\n' "$1"
}

python_bin() {
  if [[ -x ".venv/bin/python" ]]; then
    printf '%s\n' ".venv/bin/python"
  elif command -v python3 >/dev/null 2>&1; then
    command -v python3
  else
    echo "python3 is required. Install Python and run: python -m pip install -r scraper/requirements-dev.txt" >&2
    exit 1
  fi
}

pip_audit_bin() {
  if [[ -x ".venv/bin/pip-audit" ]]; then
    printf '%s\n' ".venv/bin/pip-audit"
  elif command -v pip-audit >/dev/null 2>&1; then
    command -v pip-audit
  else
    echo "pip-audit is required. Run: python -m pip install -r scraper/requirements-dev.txt" >&2
    exit 1
  fi
}

PYTHON="$(python_bin)"
PIP_AUDIT="$(pip_audit_bin)"

compose_cmd() {
  if [[ -f ".env" ]]; then
    docker compose "$@"
  else
    docker compose --env-file .env.example "$@"
  fi
}

step "Node typecheck"
npm run typecheck

step "Node unit tests"
npm test

step "Frontend e2e tests"
npm run test:e2e

step "Production build"
npm run build

step "Scraper tests"
PYTHONPATH=scraper "$PYTHON" -m pytest scraper/tests

step "Node dependency audit"
npm audit --workspaces --omit=dev

step "Python dependency audit"
"$PIP_AUDIT" -r scraper/requirements.txt

step "Compose config"
compose_cmd --profile scraper config --quiet

step "Secret hygiene"
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  echo ".env is tracked by Git; remove it before publishing." >&2
  exit 1
fi

if [[ "$run_docker" == true ]]; then
  step "Docker stack"
  export SCRAPER_RUN_ON_START=false
  compose_cmd up -d --build --wait --wait-timeout 180

  step "Docker public surface"
  ports_summary="$(compose_cmd ps --format json | node --input-type=module -e "
let input = '';
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  const lines = input.trim().split(/\n+/).filter(Boolean);
  for (const line of lines) {
    const service = JSON.parse(line);
    const publishers = Array.isArray(service.Publishers) ? service.Publishers : [];
    for (const publisher of publishers) {
      if (!Number(publisher.PublishedPort)) {
        continue;
      }

      console.log(
        [
          service.Service,
          publisher.URL || '',
          publisher.PublishedPort,
          publisher.TargetPort,
          publisher.Protocol || 'tcp',
        ].join(' ')
      );
    }
  }
});
")"
  if [[ "$ports_summary" != "frontend 127.0.0.1 8080 8080 tcp" ]]; then
    echo "only frontend may publish a host port, and it must be 127.0.0.1:8080->8080/tcp" >&2
    printf '%s\n' "$ports_summary" >&2
    exit 1
  fi
  curl -fsS http://localhost:8080/healthz >/dev/null
  curl -fsS http://localhost:8080/api/ready >/dev/null
  curl -fsS http://localhost:8080/api/service-dates >/dev/null
  compose_cmd ps --services --status running | grep -qx scraper-scheduler
  compose_cmd logs scraper-scheduler | grep -q "next scheduled import"

  step "Read-only backend DB user"
  compose_cmd exec -T backend node --input-type=module -e "import { pool } from './src/db.js'; try { await pool.query('DELETE FROM scraper_runs WHERE id = -1'); console.error('backend write unexpectedly succeeded'); process.exit(1); } catch (error) { if (error.code !== 'ER_TABLEACCESS_DENIED_ERROR') throw error; } finally { await pool.end(); }"
fi

step "Public readiness checks passed"
