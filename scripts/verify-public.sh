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
  - Release tree hygiene check that publishable source is committed

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

step "Repository metadata"
if [[ ! -f LICENSE ]]; then
  echo "LICENSE is required before publishing the repository." >&2
  exit 1
fi

node --input-type=module <<'NODE'
import fs from 'node:fs';

const readPackage = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const root = readPackage('package.json');
const backend = readPackage('backend/package.json');
const frontend = readPackage('frontend/package.json');
const packages = [
  ['package.json', root],
  ['backend/package.json', backend],
  ['frontend/package.json', frontend],
];

if (!/^\d+\.\d+\.\d+$/.test(root.version)) {
  throw new Error(`package.json version must be plain semver, got ${root.version}`);
}

for (const [path, pkg] of packages) {
  if (pkg.version !== root.version) {
    throw new Error(`${path} version ${pkg.version} does not match root ${root.version}`);
  }
  if (pkg.license !== 'AGPL-3.0-only') {
    throw new Error(`${path} must declare AGPL-3.0-only license metadata`);
  }
}

if (root.private !== true || backend.private !== true || frontend.private !== true) {
  throw new Error('workspace packages should stay private to prevent accidental npm publishing');
}

if (!root.repository?.url?.includes('ElonMealsDB')) {
  throw new Error('package.json repository URL is missing or unexpected');
}
NODE

step "Compose config"
compose_cmd --profile scraper config --quiet

step "Secret hygiene"
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  echo ".env is tracked by Git; remove it before publishing." >&2
  exit 1
fi

if git ls-files tmp output .playwright-cli frontend/dist frontend/test-results scripts/manual_retail_pdf_second_pass.py | grep -q .; then
  echo "Generated or local-only artifacts are tracked; remove them before publishing." >&2
  git ls-files tmp output .playwright-cli frontend/dist frontend/test-results scripts/manual_retail_pdf_second_pass.py >&2
  exit 1
fi

step "Release tree hygiene"
dirty_status="$(git status --porcelain --untracked-files=all)"
if [[ -n "$dirty_status" ]]; then
  echo "The publishable Git tree is not clean. Commit or remove source changes before treating this as public-ready." >&2
  printf '%s\n' "$dirty_status" >&2
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
  missing_asset_status="$(curl -sS -o /dev/null -w "%{http_code}" http://localhost:8080/assets/__missing-public-verifier__.js || true)"
  if [[ "$missing_asset_status" != "404" ]]; then
    echo "missing frontend assets must return 404, not the SPA fallback" >&2
    exit 1
  fi
  compose_cmd ps --services --status running | grep -qx scraper-scheduler
  compose_cmd logs scraper-scheduler | grep -q "next scheduled import"

  step "Read-only backend DB user"
  compose_cmd exec -T backend node --input-type=module -e "import { pool } from './src/db.js'; try { await pool.query('DELETE FROM scraper_runs WHERE id = -1'); console.error('backend write unexpectedly succeeded'); process.exit(1); } catch (error) { if (error.code !== 'ER_TABLEACCESS_DENIED_ERROR') throw error; } finally { await pool.end(); }"
fi

step "Public readiness checks passed"
