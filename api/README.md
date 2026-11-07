# sg-care-capacity API

A read-only FastAPI service over **one published data snapshot**: the `data-YYYY-MM-DD` GitHub
release that `sg-health publish` produces each week. It never reads the pipeline's working
warehouse and never writes anything.

## Run it

```bash
pip install -e "api[dev]"

# Against a local snapshot (no download): the folder `sg-health publish` writes
LOCAL_SNAPSHOT_PATH=data/build/publish uvicorn --factory sg_health_api.main:create_app --reload

# Against the latest release (downloads ~3 MB once, then reuses the verified cache)
uvicorn --factory sg_health_api.main:create_app
```

Interactive docs: <http://127.0.0.1:8000/docs>. The schema is committed as [`openapi.json`](openapi.json).

**Docker:**

```bash
docker build -t sg-health-api api
docker run --rm -p 8000:8000 -e CORS_ALLOW_ORIGINS=http://localhost:3000 sg-health-api
```

## Configuration (environment variables only)

| Variable | Default | Meaning |
|---|---|---|
| `DATA_SNAPSHOT` | `latest` | Release tag to serve, e.g. `data-2026-11-06`. `latest` = the newest `data-YYYY-MM-DD` release **that isn't marked pre-release**, so a withdrawn snapshot is skipped automatically |
| `LOCAL_SNAPSHOT_PATH` | unset | Serve a local snapshot folder instead of downloading. Still verified |
| `SNAPSHOT_CACHE_DIR` | `<tmp>/sg-health-api` | Where downloads are kept. Files whose hash already matches aren't downloaded again |
| `SNAPSHOT_REPO` | `gabrielneo/sg-care-capacity` | Repository holding the releases |
| `GITHUB_TOKEN` | unset | Optional, for GitHub's API rate limit. Sent to `api.github.com` only, never to downloads |
| `CORS_ALLOW_ORIGINS` | empty | Comma-separated origins allowed to call the API from a browser. Empty = none. `*` is refused |

## Startup: verify, or refuse to start

1. Resolve the release, then download `manifest.json` and every file it lists.
2. Check each file's **size and SHA-256** against the manifest.
3. Open `analytics.duckdb` with `read_only=True`, and check that every mart exists and has the
   manifest's row count.
4. Validate the map GeoJSON against the response models, and build the responses that never
   change.

If any step fails, the app exits with the reason, so an unverified snapshot is never served.

**What verification proves:** the manifest is published together with the files it describes.
Verification therefore catches incomplete or corrupted downloads and mixed-up files. It doesn't
prove the release itself is genuine; that rests on who can publish releases to the repository.

## Responses

Every response is `{data, meta}`:

```json
{"data": ..., "meta": {"snapshot_id": "data-2026-11-06", "as_of": "2026-10-31",
  "sources": [{"id": "moh_bed_waits", "name": "...", "url": "...", "as_of": "...", ...}],
  "coverage": {...}, "caveats": ["..."], "dq_warnings": [{"check_id": "...", ...}]}}
```

- **`as_of`** says when the figures were current, not when they were downloaded. For example,
  the CHAS clinic list is as of **2024-06-06**.
- Show **`caveats`** and **`dq_warnings`** with the figures. The warnings come from the
  validation run that published the snapshot, filtered to the tables behind that endpoint.
- **Missing values are `null`**, never `0`.

Definitions of every field are in [`docs/data_dictionary.md`](../docs/data_dictionary.md).

**Errors** use the same envelope: `{"data": null, "meta": {...}, "error": {"code", "message", "field"}}`.

| Status | Codes |
|---|---|
| 400 | `invalid_parameter`, `unknown_hospital`, `invalid_range`, `range_too_long`, `invalid_bbox` |
| 404 | `not_found` |
| 405 | `method_not_allowed` (GET only) |

## Endpoints (`/api/v1`)

| Endpoint | Parameters | Returns |
|---|---|---|
| `GET /meta` | | Snapshot id, release, pipeline commit, row counts, check summary |
| `GET /health` | | `{"status": "ok", "snapshot_id"}` (never cached) |
| `GET /hospitals` | | The 9 MOH-reported sites, with coverage notes (AH is a UCC) |
| `GET /ed/daily` | `hospital`, `from`, `to` | Daily median bed wait and attendances. Default: the 90 days up to the latest published day. At most 2 years |
| `GET /ed/weekly` | `hospital`, `weeks` (1–104, default 12) | ISO-week aggregates with day counts and a completeness flag |
| `GET /ed/summary` | | Latest **complete** week per hospital vs the mean of the 4 complete weeks before it (see below) |
| `GET /clinics` | `cdmp`, `bbox`, `limit` (≤ 500), `offset` | Active CHAS clinics, paged, with `total` |
| `GET /areas/access` | | GeoJSON FeatureCollection of the 55 planning areas (access for residents aged 65+) |
| `GET /quality` | | Results of the validation run behind this snapshot |
| `GET /live/nuhs/latest` | | Each NUHS site's latest wait estimate **in the snapshot** |
| `GET /population` | | Residents and the share aged 65+ for each year in the snapshot (the sum of SingStat's planning areas) |
| `GET /insights` | `type`, `entity`, `top`, `headline` | Findings that passed their statistical gates, each with its key number, labels and chart data ([method](../docs/insights_method.md)) |

`hospital` takes the codes from `/hospitals`, case-insensitive. `bbox` is
`minLon,minLat,maxLon,maxLat`. `cdmp=false` returns clinics known not to be in CDMP; clinics with
no programme list are excluded from both `true` and `false`.

**`/ed/summary` method:**
- **Latest week:** the most recent ISO week (Monday to Sunday) with all 7 days of both metrics
  for that hospital. MOH's newest week is usually 6 of 7 days, and a partial week is never
  compared.
- **Baseline:** the mean of the 4 ISO weeks immediately before it, computed only if all 4 are
  complete. Otherwise the baseline is `null`, with a `note` saying which week is short.
- **Waits** are averages of daily medians, not weekly medians.

**`/live/nuhs/latest` comes from the weekly snapshot, not a live feed.** Readings can be up to 7
days old, and `meta.as_of` and the caveats say so. NUH lists Adult and Children's Emergency
separately: filter on `is_adult_ed` to get one reading per hospital.

## Caching and CORS

- **ETag** is `"<snapshot_id>"`. A request with a matching `If-None-Match` gets `304 Not Modified`.
- **Cache-Control** is `public, max-age=3600, stale-while-revalidate=86400`. The data change
  weekly; the 1-hour limit means a new snapshot, or a new API version, reaches clients within the
  hour. `/health` and errors are `no-store`.
- **CORS:** only the origins in `CORS_ALLOW_ORIGINS` are allowed, GET only, with `ETag` exposed.

## Rolling back

To serve an earlier snapshot, set `DATA_SNAPSHOT=data-2026-11-01` and restart.

To withdraw a bad snapshot for good, mark its release as **pre-release** (see
[docs/runbook.md](../docs/runbook.md)). `latest` then skips it on the next restart.

## Tests

```bash
pytest -q api                                                   # fixture snapshot, offline
LOCAL_SNAPSHOT_PATH=data/build/publish pytest -q api -m snapshot  # contract on a real snapshot
python -m sg_health_api.openapi > api/openapi.json              # after changing a model or route
```

The suite covers the following:
- The fixture snapshot is built at test time, and its columns are checked against
  `docs/data_dictionary.md`.
- A **contract test** calls every endpoint in the schema and checks `{data, meta}`,
  `meta.as_of` and the declared model.
- Startup is refused for tampered, missing or miscounted files.
- Inputs are validated, and errors come back in the envelope.
- ETag/304, cache headers and CORS behave as described.
- A static check fails if any SQL is built from a string.
- The committed `openapi.json` must match the code.
