#!/usr/bin/env bash
# Start the real API on the API's own fixture snapshot (api/tests/fixture_snapshot.py), so the
# end-to-end tests see fixed, known data: 3 hospitals, 2 planning areas, a missing day, an
# inactive clinic, NUHS readings from two snapshots. No network, no real data.
set -euo pipefail
cd "$(dirname "$0")/../../api"
PY="${E2E_PYTHON:-}"
if [ -z "$PY" ]; then
  if [ -x ../.venv/bin/python ]; then PY=../.venv/bin/python; else PY=python3; fi
fi
SNAP="$(mktemp -d)/snapshot"
"$PY" -c "import pathlib, sys; sys.path.insert(0, 'tests'); import fixture_snapshot; fixture_snapshot.build(pathlib.Path(sys.argv[1]))" "$SNAP"
exec env LOCAL_SNAPSHOT_PATH="$SNAP" "$PY" -m uvicorn --factory sg_health_api.main:create_app --host 127.0.0.1 --port "${E2E_API_PORT:-8791}"
