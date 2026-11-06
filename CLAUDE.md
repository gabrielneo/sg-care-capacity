# CLAUDE.md

## Project

**Right-siting care in a super-aged Singapore** is a healthcare analytics portfolio project. It tracks:

- **ED bed waits and attendances**: MOH published statistics.
- **Clinic access for residents aged 65+**: CHAS and CDMP clinic locations against SingStat resident population by planning area.
- **Live ED wait estimates**: published current wait indicators.

**Audience:** hiring managers for a Business Analyst / Product role at Synapxe, Singapore's national HealthTech agency. Clarity, data accuracy and documentation matter more than feature count. When in doubt, ship less and document it better.

## Monorepo layout

```
pipeline/     Python ETL: ingest → validate → transform → load into DuckDB
api/          FastAPI service that reads the published warehouse snapshot
web/          Next.js (App Router) + TypeScript frontend
docs/         data_dictionary.md, methodology.md, case_study.md, adr/ (Architecture Decision Records)
data/raw/     Downloaded source files, unmodified (gitignored)
data/build/   DuckDB warehouse and published snapshots (gitignored)
```

Each top-level package owns its own dependencies and tests (`pipeline/tests/`, `api/tests/`, `web/` test setup).

## Tech stack

| Layer    | Choice |
|----------|--------|
| Pipeline | Python 3.12, DuckDB, pandas, geopandas/shapely (**pipeline only**; never import these in `api/`) |
| API      | FastAPI, Python 3.12 |
| Web      | Next.js App Router, TypeScript, Tailwind, Recharts, MapLibre GL or Leaflet (choose one and record it in an ADR) |
| Storage  | DuckDB file built in `data/build/`; the last good snapshot is published as a GitHub Release asset (not committed to git) |

## Data principles (non-negotiable)

1. **No personal or patient-level data, ever.** Only aggregate, publicly published figures.
2. **Never fabricate, impute or interpolate values silently.** Missing means missing, and it is shown as missing in the warehouse, the API and the UI (for example a gap in a chart or "No data", never a zero).
3. **Every metric is documented in `docs/data_dictionary.md`** with its definition, unit, source and known caveats. Add or update the entry in the same commit that adds or changes the metric.
4. **Every number shown to users carries `as_of` and `source`.** API responses include them, and the UI displays them.
5. **Failed error-level data checks block publishing.** The site keeps serving the last good snapshot. Warning-level checks are logged and surfaced, but they do not block.
6. **Every warehouse row keeps lineage:** `source_url`, `source_sha256`, `ingested_at`.

## Working rules

- **Plan first, then wait for approval** before writing or moving code.
- **Small, focused commits**, one logical change each.
- **Tests with every change.** No feature or fix lands without a test that covers it.
- **If a source's structure is unclear, stop and ask.** Don't guess at column meanings, units, date conventions or planning-area name mappings.
- **Justify any new dependency** (why it's needed, what alternatives exist) before adding it.
- **No secrets in code.** Use environment variables, and commit a `.env.example` with placeholder values only.

## Commands

> Fill these in as each piece is built. TODO = not built yet.

```bash
# Pipeline (run from the repo root; package: pipeline/sg_health, CLI: sg-health)
# setup:        python3.12 -m venv .venv && source .venv/bin/activate && pip install -e "pipeline[dev]"
#               (add ,browser to the extras + `python -m playwright install chromium` for JS pages)
# run ETL:      sg-health run [--sources moh,live,opendata,singstat]   # fetch → data/raw → parse → warehouse
# backfill:     sg-health backfill --start 2024-01-01 --max-snapshots 80   # MOH history via Wayback
# reparse:      sg-health reparse        # rebuild all tables from data/raw only; no network
# report:       sg-health report         # Excel summary from the warehouse
# logs:         JSON lines on stderr; one "source_summary" line per source: sg-health run 2>&1 | grep source_summary
# paths:        data/raw/ (immutable raw zone + manifest.jsonl), data/build/warehouse.duckdb (working DB)
#               override with --raw-dir / --db / --report or SG_HEALTH_DATA_DIR
# run checks:   sg-health validate     # all data-quality checks; exit 1 = publish blocked (docs/data_quality.md)
# publish:      TODO
# tests:        pytest -q pipeline/tests

# API
# setup:        TODO
# dev server:   TODO
# tests:        TODO

# Web
# setup:        TODO
# dev server:   TODO
# build:        TODO
# lint/type:    TODO
# tests:        TODO
```
