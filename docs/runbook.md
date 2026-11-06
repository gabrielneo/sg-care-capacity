# Runbook

How the data is collected, checked and released, and what to do when something goes wrong.
Commands assume the repo root and an installed pipeline (`pip install -e "pipeline[dev]"`). GitHub
commands use the [`gh` CLI](https://cli.github.com/); everything can also be done in the web UI.

## What runs, and where data lives

| Workflow | When | What it does | Where its output lives |
|---|---|---|---|
| `weekly.yml` | Sundays 00:00 UTC (08:00 SGT), or **Actions → Weekly pipeline → Run workflow** | test → ingest → validate → transform → publish | Raw history: release **`data-latest`** (`raw.tar.gz`). Snapshots: releases **`data-YYYY-MM-DD`** (newest 12 kept) |
| `live.yml` | Every 3 hours (at :15) | NUHS live waits only, into a separate store | Release **`live-latest`** (`live.tar.gz`, `nuhs_live_waits.parquet`). Never a snapshot |
| `ci.yml` | Every pull request and push to `main` | ruff, mypy, unit tests; guards against committed binaries or `.env` | Nothing (checks only) |

- **`data-latest` is history, not a snapshot.** It holds every raw file ever downloaded. Never delete it:
  without it the next weekly run starts from nothing, and MOH only shows its latest week.
- **No database is ever committed to git.** Snapshots are release assets. CI fails if a `.duckdb`,
  `.parquet`, `.xlsx`, `.db` or `.sqlite` file is tracked.

## The weekly release, step by step

1. **Test**: the offline unit tests. A failure stops the run before any data is touched.
2. **Restore** `data/raw` from `data-latest`. If that release exists but can't be downloaded, the run
   stops: continuing with an empty folder would overwrite history.
3. **Ingest**: `sg-health reparse` rebuilds the clean tables from history, then `sg-health run` fetches
   this week's MOH, NUHS, data.gov.sg and SingStat (from the committed reference file). A source being
   down doesn't stop the run.
4. **Archive raw history, always**: if the manifest didn't shrink, `raw.tar.gz` is re-uploaded to
   `data-latest`, even if a later step fails.
5. **Validate**: `sg-health validate`. If any check **blocks publishing** (an ERROR at file or dataset
   level, e.g. stale data, a unit error, missing population), nothing is published and an **issue
   labelled `data-quality`** lists the failing checks (a new comment if one is already open).
   Quarantined rows (row-level ERRORs) don't block; they are excluded from the marts and counted in
   the manifest. See [data_quality.md](data_quality.md).
6. **Transform**: `sg-health transform` builds the marts and the web GeoJSON.
7. **Publish**, only if ingest, validate and transform all succeeded: `sg-health publish` re-runs
   validation (and refuses if anything blocks), then writes into `data/build/publish/`:
   - `analytics.duckdb`: **only** the marts plus `dq_results`, built fresh, checkpointed, read-only;
   - `parquet/<mart>.parquet` for every mart;
   - `planning_area_access.geojson`;
   - `manifest.json`: `snapshot_id`, `as_of` per source, row counts, coverage per hospital, check
     summary, SHA-256 and size of every file, pipeline git commit.

   The run verifies every hash, then uploads the files to release **`data-YYYY-MM-DD`**. Parquet files
   are uploaded under their mart name (`fct_ed_daily.parquet`); in the manifest they appear as
   `parquet/fct_ed_daily.parquet`. A second run on the same day **replaces** that day's files.
8. **Prune**: snapshot releases beyond the newest 12 are deleted (`sg-health snapshots-to-prune`).
   `data-latest`, `live-latest` and any other tag are never touched.
9. **Fail the job** if any stage failed, after the archive is safe, so GitHub emails you.

### Run it by hand

```bash
sg-health reparse --no-transform --no-report      # rebuild clean tables from data/raw
sg-health run --no-validate --no-transform        # fetch new data
sg-health validate                                # exit 1 = publishing blocked
sg-health transform
sg-health publish                                 # -> data/build/publish/ (exit 1 if blocked)
```

### Check a published snapshot

```bash
gh release download data-2026-11-08 --dir snap && cd snap
python - <<'PY'
import hashlib, json
m = json.load(open("manifest.json"))
for rel, meta in m["artefacts"].items():
    name = rel.split("/")[-1]                        # parquet/ prefix is dropped in release assets
    ok = hashlib.sha256(open(name, "rb").read()).hexdigest() == meta["sha256"]
    print(("OK  " if ok else "BAD ") + rel)
PY
```

Open the database read-only: `duckdb -readonly analytics.duckdb` (the file is also read-only on disk).

## When publishing is blocked

1. Open the `data-quality` issue (or the run's **Validate** step log) to see which checks block.
2. Look each one up in [data_quality.md](data_quality.md), section *Fixing a failure*:
   - **Source problem** (MOH late, a source down): usually fixes itself next week; check `freshness.*`.
   - **Parser problem** (a source changed layout): fix the parser, add a test, push, then run the
     workflow by hand. `reparse` re-parses all history with the fix.
3. The site keeps serving the **last published snapshot** in the meantime. Nothing to roll back.
4. Close the issue once a run publishes again.

## Rolling back to an earlier snapshot

Snapshots are immutable releases, so rolling back means **pointing consumers at an earlier tag**,
never editing data.

1. **Pick the snapshot.** `gh release list` shows the `data-YYYY-MM-DD` releases; each release's notes
   and `manifest.json` show its checks and row counts. Choose the newest one you trust.
2. **Point the API at it.** Set `DATA_SNAPSHOT=data-2026-11-01` and restart the API. It downloads
   and verifies that release and refuses to start if any file doesn't match its manifest. Check
   with `curl …/api/v1/meta`, which shows `snapshot_id` and `release_tag`.
3. **Mark the bad snapshot, don't delete it.** Keep it for the record and flag it:
   ```bash
   gh release edit data-2026-11-08 --prerelease \
     --notes "WITHDRAWN: <reason>. Use data-2026-11-01. See issue #<n>."
   ```
   Deleting it would also remove the evidence of what was published. Marking it pre-release is
   also what makes the API's `DATA_SNAPSHOT=latest` skip it.
4. **Fix forward.** Fix the cause, run the weekly workflow by hand, check the new snapshot, then set
   `DATA_SNAPSHOT=latest` again (or unset it) and restart the API.

**Retention:** only 12 snapshots are kept (about 3 months). To keep one longer, e.g. for the case
study, copy its assets elsewhere or re-tag it outside the `data-YYYY-MM-DD` pattern (pruning only
matches that pattern):
`gh release download data-2026-11-08 --dir keep && gh release create case-study-2026-11 keep/*`.

**Reproducing a snapshot:** the release files *are* the snapshot. Rebuilding from raw history at the
commit in `manifest.json` gives that code version's output on **today's** raw files, which include
everything fetched since: close, but not byte-identical.

## SingStat population, yearly refresh

SingStat publishes each June edition around **September**. GitHub's runners can't download it (SingStat
returns HTTP 403 to them), so it is refreshed **by hand** and committed. The `freshness.population_15_months`
warning appears once the committed edition is more than 15 months past its reference date.

1. Open SingStat's [geographic distribution page](https://www.singstat.gov.sg/find-data/explore-data-themes/population/geographic-distribution/latest-news-data),
   section **Singapore Residents by Planning Area / Subzone, Age Group, Sex and *Type of Dwelling***.
   **Not** the *Floor Area of Residence* edition: it leaves out about 20,000 residents aged 65+.
2. Download the new June edition **in CSV** (a zip) into `data/reference/singstat/`, e.g.
   `respopagesextod2027.zip`, and delete the old file.
3. Check it parses and looks right:
   ```bash
   python -c "from sg_health.parsers.singstat import parse_residents_zip as p; \
     d = p(open('data/reference/singstat/respopagesextod2027.zip','rb').read()); \
     print(d.planning_area.nunique(), int(d.residents_total.sum()), int(d.residents_65plus.sum()))"
   ```
   Expect 55 planning areas (unless URA changed boundaries) and totals close to last year's.
4. In `pipeline/sg_health/config.py`, update `SINGSTAT_RESIDENTS_FILE`, `SINGSTAT_RESIDENTS_SHA256`
   (`shasum -a 256 <file>`) and `SINGSTAT_RESIDENTS_URL` (the link you downloaded from, for lineage).
5. Update the expected totals in `test_the_committed_reference_file_matches_its_hash_and_parses`
   (`pipeline/tests/test_ingest.py`) and the figures in `docs/data_dictionary.md` (source status).
6. Run `pytest -q pipeline/tests`, then `sg-health reparse && sg-health validate`, and commit
   (`data: SingStat residents June 2027`). The next weekly run publishes it.

If URA changes planning-area boundaries, `completeness.population_present` or the area name map will
stop the build and list the names: add the new boundary file and update `ref_area_name_map` logic
deliberately; nothing is guessed.

## Secrets

- **`DATAGOV_API_KEY`** (optional; higher data.gov.sg rate limits).
  - **CI:** repository secret: *Settings → Secrets and variables → Actions → New repository secret*,
    Name exactly `DATAGOV_API_KEY`, the key as the value.
  - **Locally:** put `DATAGOV_API_KEY=...` in `.env` at the repo root (copy `.env.example`). It's loaded
    automatically with python-dotenv, never required, and a real environment variable wins.
  - **Never commit it**: the repo is public. If it leaks, revoke it on data.gov.sg and create a new one.
- `GITHUB_TOKEN` is provided by Actions; the workflows declare only the permissions they need.

## Live waits store

`live.yml` keeps every NUHS reading in its own raw store. To work with it locally:

```bash
mkdir -p data-live && gh release download live-latest --pattern live.tar.gz && tar -xzf live.tar.gz -C data-live
SG_HEALTH_DATA_DIR=$PWD/data-live sg-health reparse --no-transform --no-report
```

Or just read `nuhs_live_waits.parquet` from the same release.

## Housekeeping

- **GitHub disables scheduled workflows after 60 days without repository activity** (it emails first).
  Re-enable under *Actions → <workflow> → Enable workflow*, or push any commit.
- **Notifications:** make sure *Settings → Notifications → Actions* emails you about failed workflows.
- **Restore raw history locally:** `gh release download data-latest --pattern raw.tar.gz && mkdir -p data && tar -xzf raw.tar.gz -C data && sg-health reparse`.
