#!/usr/bin/env bash
# Lighthouse CI on the Overview (/), on Lighthouse's default mobile emulation: a mid-range phone
# (4x CPU slowdown) on a throttled 4G connection. Three runs; the median must meet the budgets in
# lighthouserc.json: LCP <= 2.5 s, CLS <= 0.01, JavaScript <= 200 kB transferred (gzip).
#
# It serves what the e2e tests serve: the real API on its fixture snapshot and the production
# build. Reports stay on disk (web/.lighthouseci/); nothing is uploaded.
#   npm run lighthouse            (builds first; SKIP_BUILD=1 to reuse .next)
set -euo pipefail
cd "$(dirname "$0")/.."
API_PORT=8795
WEB_PORT=3320

LOGS="$(mktemp -d)"
cleanup() { [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null; [ -n "${WEB_PID:-}" ] && kill "$WEB_PID" 2>/dev/null; true; }
# On any failure, show why: the servers' own output (otherwise a failed start leaves no trace in CI).
on_error() {
  echo "lighthouse: failed; the servers' last output follows" >&2
  for f in api web; do [ -f "$LOGS/$f.log" ] && { echo "--- $f ---" >&2; tail -n 40 "$LOGS/$f.log" >&2; }; done
}
trap cleanup EXIT
trap on_error ERR

wait_for() {
  for _ in $(seq 1 120); do curl -fsS -o /dev/null "$1" 2>/dev/null && return 0; sleep 1; done
  echo "lighthouse: $1 did not come up" >&2; return 1
}

E2E_API_PORT=$API_PORT ./e2e/start-api.sh > "$LOGS/api.log" 2>&1 &
API_PID=$!
rm -rf .next/cache/fetch-cache          # never serve API responses cached from another API or fixture
[ -n "${SKIP_BUILD:-}" ] || npm run build
API_BASE_URL="http://127.0.0.1:$API_PORT" npx next start -p "$WEB_PORT" > "$LOGS/web.log" 2>&1 &
WEB_PID=$!
wait_for "http://127.0.0.1:$API_PORT/api/v1/health"
wait_for "http://127.0.0.1:$WEB_PORT/methodology"
curl -fsS -o /dev/null "http://127.0.0.1:$WEB_PORT/"          # warm the API cache, as a visitor after the first would see it

# The Chromium the e2e tests use, unless CHROME_PATH says otherwise. It is Chrome for Testing, which
# Ubuntu 24.04 (GitHub's runners) won't sandbox, so lighthouserc.json passes --no-sandbox: this only
# ever loads our own site on localhost.
export CHROME_PATH="${CHROME_PATH:-$(node -e 'console.log(require("@playwright/test").chromium.executablePath())')}"
rm -rf .lighthouseci
npx lhci collect && npx lhci assert && npx lhci upload
