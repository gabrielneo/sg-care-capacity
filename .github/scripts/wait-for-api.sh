#!/usr/bin/env bash
# Wait until the API serves the expected data release, after a restart.
#   usage: wait-for-api.sh <api-url> <snapshot-id> [timeout-seconds, default 1200] [poll-seconds, default 20]
# Polls <api-url>/api/v1/health. While Render deploys, the old instance keeps answering with the old
# snapshot, so this waits for the switch. Exits 1 (failing the job, so GitHub emails) on timeout.
set -euo pipefail
url="${1%/}"
want="$2"
timeout="${3:-1200}"
poll="${4:-20}"
if [ -z "$url" ]; then
  echo "::warning::API_PUBLIC_URL is not set (Settings > Secrets and variables > Actions > Variables), so the restart can't be checked."
  exit 0
fi
deadline=$(( $(date +%s) + timeout ))
seen=""
while :; do
  body="$(curl -fsS --max-time 30 "$url/api/v1/health" 2>/dev/null || true)"
  seen="$(printf '%s' "$body" | python3 -c 'import json, sys; print(json.load(sys.stdin)["data"]["snapshot_id"])' 2>/dev/null || true)"
  if [ "$seen" = "$want" ]; then
    echo "The API serves $want."
    exit 0
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    break
  fi
  echo "Waiting: the API serves ${seen:-nothing yet}; expecting $want."
  sleep "$poll"
done
echo "::error::After ${timeout}s the API serves '${seen:-nothing}', not $want. It keeps serving its previous snapshot. See docs/runbook.md, 'When a scheduled run fails'."
exit 1
