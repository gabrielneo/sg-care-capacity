# CLAUDE.md

## Project

**Right-siting care in a super-aged Singapore** is a healthcare analytics portfolio project. It tracks:

- **ED bed waits and attendances**: MOH published statistics.
- **Clinic access for residents aged 65+**: CHAS and CDMP clinic locations against SingStat resident population by planning area.
- **Live ED wait estimates**: published current wait indicators.

**Audience:** hiring managers for a Business Analyst / Product role at Synapxe, Singapore's national HealthTech agency. Clarity, data accuracy and documentation matter more than feature count.

## Monorepo layout

```
pipeline/     Python ETL: ingest → validate → transform → load into DuckDB
api/          FastAPI service that reads the published warehouse snapshot
web/          Next.js (App Router) + TypeScript frontend
docs/         data_dictionary.md, methodology.md, case_study.md, adr/ (Architecture Decision Records)
data/raw/     Downloaded source files, unmodified (gitignored)
data/build/   DuckDB warehouse and published snapshots (gitignored)
```

## Tech stack

| Layer    | Choice |
|----------|--------|
| Pipeline | Python 3.12, DuckDB, pandas, geopandas/shapely (pipeline only) |
| API      | FastAPI, Python 3.12 |
| Web      | Next.js App Router, TypeScript, Tailwind, Recharts, MapLibre GL or Leaflet |
| Storage  | DuckDB file built in `data/build/`; the last good snapshot is published as a GitHub Release asset (not committed to git) |

## Data principles (non-negotiable)

1. **No personal or patient-level data, ever.**
2. **Never fabricate, impute or interpolate values silently.** Missing means missing, shown as missing.
3. **Every metric has a written definition, unit, source and known caveats** in `docs/data_dictionary.md`.
4. **Every number shown to users carries `as_of` and `source`.**
5. **Failed error-level data checks block publishing;** the site keeps the last good snapshot.
6. **Every warehouse row keeps lineage:** `source_url`, `source_sha256`, `ingested_at`.

## Insight principles

1. **Insights are computed by deterministic code from the marts.** No LLM, no hand-written numbers.
2. **An insight that fails its statistical gate is not published.** Missing evidence means no sentence, not a weaker sentence.
3. **Never use causal words** (causes, drives, leads to, because). Use "moves with", "is associated with", "is higher in".

Method and gates per detector: `docs/insights_method.md`. Suggested actions come only from reviewed entries in `docs/insight_actions.yml`.

## Working rules

- **Plan first, then wait for approval** before writing or moving code.
- **Small, focused commits**, one logical change each.
- **Tests with every change.** No feature or fix lands without a test that covers it.
- **If a source's structure is unclear, stop and ask.** Don't guess at column meanings, units, date conventions or planning-area name mappings.
- **Justify any new dependency** (why it's needed, what alternatives exist) before adding it.
- **No secrets in code.**

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
# transform:    sg-health transform    # SQL in pipeline/sql/{staging,marts}; marts.* = what the API reads
# insights:     sg-health insights     # validate + insight engine -> marts.fct_insight, data/build/insights.json (also runs inside publish)
# publish:      sg-health publish --out data/build/publish   # validates first; refuses if blocked (docs/runbook.md)
# all checks:   make test (pipeline, api, web, acceptance) · make lint · make check   # not bare `pytest` at the root
# tests:        pytest -q pipeline/tests            # offline unit tests (fixtures only)
# acceptance:   pytest -q pipeline/acceptance       # the real built data, checked as the site would use it

# API (package: api/sg_health_api; reads only a published snapshot, read-only; see api/README.md)
# setup:        pip install -e "api[dev]"
# dev server:   LOCAL_SNAPSHOT_PATH=data/build/publish uvicorn --factory sg_health_api.main:create_app --reload
#               (without LOCAL_SNAPSHOT_PATH: downloads DATA_SNAPSHOT, default latest, and verifies it)
# tests:        pytest -q api                     # fixture snapshot; contract test; openapi.json drift
#               LOCAL_SNAPSHOT_PATH=data/build/publish pytest -q api -m snapshot   # contract on real data
# lint/type:    (cd api && ruff check . && mypy)
# openapi:      python -m sg_health_api.openapi > api/openapi.json   # after changing a route or model
# docker:       docker build -t sg-health-api api && docker run --rm -p 8000:8000 sg-health-api

# Web (web/: Next.js App Router, TypeScript strict, Tailwind; see web/README.md)
# setup:        cd web && npm ci && cp .env.example .env.local     # API_BASE_URL (server-only)
# dev server:   cd web && npm run dev          # needs the API running; /dev/components shows every component
# build:        cd web && npm run build && npm start
# lint/type:    cd web && npm run lint && npm run typecheck
# tests:        cd web && npm test             # Vitest + Testing Library
# e2e:          cd web && npm run e2e          # Playwright: real API on its fixture snapshot; 1280 + 375 px; axe (make e2e)
#               first time: cd web && npm run e2e:install
# api types:    cd web && npm run gen:api      # after api/openapi.json changes; CI fails if stale
# glossary:     docs/glossary.yml (from docs/language_rules.md) -> cd web && npm run gen:glossary
# wording:      cd web && npm run lint:terms && npm run readability   # both part of npm run lint
# docs pages:   docs/*.md (methodology, case_study, adr/, ...) are rendered by the site at build time;
#               TODO(me) marks text only the author can write (never fill it with invented content)
```
