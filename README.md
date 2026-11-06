# Singapore Healthcare Capacity Pipeline

A weekly ETL pipeline that tracks hospital strain in a super-aged Singapore. It collects MOH ED bed-wait and attendance figures, NUHS live ED wait estimates, CHAS/CDMP clinic locations and the 65+ population by planning area. Every downloaded file is kept unchanged in a raw landing zone, then parsed into a DuckDB warehouse, with a formatted Excel summary on top.

Only aggregate data about institutions, places and populations is collected. There is no personal or patient-level data.

```
sources ──► PoliteHttp ──► data/raw (immutable) ──► parsers ──► DuckDB warehouse ──► Excel report
              retries,       <source>/<date>/         pure        data/build/
              rate limit,    <sha256>.<ext>           functions   warehouse.duckdb
              robots.txt     + manifest.jsonl
                                    │
                                    └──── sg-health reparse: rebuild every table from data/raw, offline
```

Sources: MOH weekly .xlsx · NUHS live ED waits · data.gov.sg CHAS clinics · SingStat · Wayback Machine (backfill only) · data.gov.sg annual A&E attendances (reconciliation only). Retired on 2026-11-06: SingHealth X-ray QWatch (page removed) and data.gov.sg HAS clinics (dataset unpublished); their tables are gone, but any raw files already landed are kept.

## 1. Install

Run everything from the repo root.

```bash
python3.12 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e "pipeline[dev,browser]"
python -m playwright install chromium                   # optional: only for JS-rendered pages
pytest -q pipeline/tests                                # offline tests, no network needed
```

Or, for a minimal install without the Playwright fallback:

```bash
pip install -e "pipeline[dev]"
```

`pip install -e` puts the `sg-health` command on your path. `python -m sg_health` does the same thing.

## 2. Run

```bash
sg-health run                          # fetch all sources, land raw files, load, write the report
sg-health run --sources moh,opendata   # a subset (moh, live, opendata, singstat)
sg-health backfill --start 2024-01-01 --max-snapshots 80   # MOH history from the Wayback Machine
sg-health reparse                      # rebuild every table from data/raw alone (no network)
sg-health validate                     # every data-quality check; exit 1 if publishing is blocked
sg-health transform                    # build staging views and mart tables (also runs after run/reparse)
sg-health report                       # rebuild the Excel report from the warehouse
sg-health -v run --sources live        # debug-level logging
```

Default paths, all under the repo root (override with `--raw-dir`, `--db`, `--report`, or move the whole `data/` folder with `SG_HEALTH_DATA_DIR`):

| Path | What | In git? |
|---|---|---|
| `data/raw/` | Raw landing zone: every downloaded file, unchanged | No |
| `data/build/warehouse.duckdb` | The pipeline's working warehouse. It is **not** what the API reads; the API will read a published snapshot. | No |
| `data/build/SG_Healthcare_Scrape_Report.xlsx` | Excel summary | No |

Optional environment variables (see `.env.example`):

| Variable | Purpose |
|---|---|
| `CRAWLER_USER_AGENT` | Your bot's identity. Point it at your public repo URL, not a personal email. |
| `DATAGOV_API_KEY` | data.gov.sg API key, for higher rate limits (free; register on data.gov.sg). |
| `SINGSTAT_POP_TABLE_ID` | SingStat Table Builder ID for "residents by planning area and age group" (see below). |
| `SG_HEALTH_DATA_DIR` | Use a different `data/` directory. |

**Finding the SingStat table ID:** search [tablebuilder.singstat.gov.sg](https://tablebuilder.singstat.gov.sg) for a table of residents by planning area and age group. The ID is in the table's URL. Pass it with `--singstat-table <ID>` or set the env var. The code flattens any Table Builder JSON into `singstat_tabledata`. It then sums age bands of 65 and over per planning area into `pop_65plus_by_area`. Check that derived table against the source the first time.

## 3. Raw landing zone and `reparse`

Every file the pipeline downloads (MOH workbooks and pages, live HTML snapshots, data.gov.sg and SingStat payloads, Wayback copies) is saved **before** it is parsed:

```
data/raw/<source>/<YYYY-MM-DD>/<sha256>.<ext>      e.g. data/raw/moh_bed_waits/2026-11-01/3f9a…c2.xlsx
data/raw/manifest.jsonl                            one line per fetch: source, url, sha256, bytes,
                                                   http_status, content_type, fetched_at, path
```

- **Immutable.** Files are written once, made read-only and never overwritten. The same bytes fetched again are not stored twice, but the fetch still gets a manifest line, so you can see that the source was checked and hadn't changed.
- **Self-describing.** `manifest.jsonl` is the source of truth and is copied into the `raw_manifest` table. You can delete the warehouse and rebuild it from `data/raw` alone.
- **Replayable.** `sg-health reparse` drops every parsed table and replays all raw files in fetch order through the same loaders `run` uses, with no network calls. Fix a parser, run `reparse`, and the whole history is re-parsed with the fix. Running it twice gives identical tables, because every time value (`ingested_at`, snapshot times) comes from when the file was fetched, never from the clock.

## 4. Warehouse schema (`data/build/warehouse.duckdb`)

| Table | Key | Contents |
|---|---|---|
| `moh_bed_waits` | hospital_name, report_date | Daily median wait from the decision to admit until the patient leaves the ED (hours) |
| `moh_ed_attendances` | hospital_name, report_date | Daily ED attendances |
| `chas_clinics` | clinic_key (HCI code) | Name, address, postal code, lat/long, `has_cdmp`, programmes, `is_active` |
| `nuhs_live_waits` | site_name, department, snapshot_timestamp | Patients waiting, estimated consult and bed waits (hours). `department` is the page section, e.g. "Adult Emergency" or "Children's Emergency": NUH appears in both. |
| `singstat_tabledata` | table_id, row_label, column_path | Raw flattened SingStat cells |
| `pop_65plus_by_area` | planning_area, year | Derived 65+ residents per planning area |
| `annual_ae_attendances` | year | MOH annual public-sector A&E attendances, for reconciliation only |
| `raw_manifest` | seq | Every fetch, mirrored from `data/raw/manifest.jsonl` |
| `quarantine_<table>` | (none) | Rows that failed an ERROR data-quality check, values as parsed. Never in the clean table. |
| `dq_findings` | (none) | Every current failure from the load gate (ERROR and WARN) |
| `dq_results` | run_id, check_id, table | Append-only log of every `validate` run |

**Lineage.** Every row of every table above except `raw_manifest` carries `source_url`, `source_sha256` and `ingested_at`, pointing at the raw file it came from. `ingested_at` is when that file was **fetched**. See [docs/data_dictionary.md](docs/data_dictionary.md) for definitions and caveats.

If the code's schema changes, commands refuse to open an older warehouse (exit code 2) and ask you to run `sg-health reparse`, which rebuilds it from `data/raw`.

All tables use `INSERT OR REPLACE` on their key, so re-running the pipeline never duplicates rows. An MOH file that is downloaded again unchanged (same sha256) is not parsed again. Clinic tables are full snapshots: rows missing from the latest download are kept, with `is_active = FALSE`. All timestamps are SGT.

Example query:

```sql
-- Which EDs had the worst week, and which file did each figure come from?
SELECT hospital_name, ROUND(AVG(median_wait_hours), 1) AS avg_wait_h,
       SUM(total_attendances) AS attendances, ANY_VALUE(b.source_url) AS bed_wait_file
FROM moh_bed_waits b JOIN moh_ed_attendances a USING (hospital_name, report_date)
WHERE report_date >= current_date - INTERVAL 7 DAY
GROUP BY 1 ORDER BY 2 DESC;
```

## 5. Marts

`sg-health transform` runs plain SQL files in DuckDB: `pipeline/sql/staging/` (views over the clean
tables, typed and renamed) then `pipeline/sql/marts/` (tables). These are what the API and site
read:

| Mart | Grain | Contents |
|---|---|---|
| `marts.dim_hospital` | site (9) | Cluster (SingHealth, NHG Health, NUHS), ED or UCC, first reporting date, coverage notes |
| `marts.fct_ed_daily` | hospital × day | MOH median bed wait and attendances, ISO week, `is_complete_week`, WARN `dq_flags`, per-metric lineage |
| `marts.fct_ed_weekly` | hospital × ISO week | **Mean of daily medians** (not a weekly median), total attendances, days reported per metric |
| `marts.dim_clinic` | CHAS clinic | `has_cdmp`, `is_active`, location; `as_of` is data.gov.sg's own update date |
| `marts.fct_live_ed_snapshot` | NUHS site × department × snapshot | Live readings, labelled `estimate` |

Every mart has `as_of` and `as_of_basis` (`source_updated`, `fetched` or `reference_checked`) and
source hashes. Row counts are reconciled at every step into `transform_log`; a row lost without a
logged reason stops the build. Column definitions: [docs/data_dictionary.md](docs/data_dictionary.md).

## 6. Data quality

Parsed rows pass through a **load gate** before reaching a clean table. Rows that fail an ERROR
check go to `quarantine_<table>` and never into the clean table; WARN rows are published and
flagged. The gate never changes a value. `sg-health validate` adds the dataset-level checks
(completeness, freshness, outliers, reconciliation), logs every check to `dq_results`, prints a
summary table, and **exits 1 if publishing must be blocked**:

```
STATUS              SEVERITY  CHECK                            TABLE               ROWS  DETAILS
FAIL (quarantined)  ERROR     clinic.coordinates_in_singapore  chas_clinics        1     19M0103: lat 1.0162... is outside Singapore
WARN                WARN      range.bed_wait_over_24h          moh_bed_waits       63    Ng Teng Fong General Hospital, 2023-02-01: ...
PASS                ERROR     unit.file_vs_stored              moh_bed_waits       0
...
run 20261106T131133-92b674: 52 checks, 4 failing, 0 blocking publish -> OK to publish
```

Only file- or dataset-level ERRORs block publishing (e.g. a minutes/hours unit error, data more
than 28 days old). A quarantined row doesn't: it is already excluded. Every check, its threshold
and why is in [docs/data_quality.md](docs/data_quality.md).

## 7. Logging

Logs are JSON lines on stderr. At the end of every `run`, `backfill` and `reparse`, each source logs exactly one summary line:

```json
{"ts": "2026-11-06T12:02:38+08:00", "level": "INFO", "logger": "sg_health.load",
 "msg": "run moh_bed_waits: read 6, parsed 5, dropped 1", "event": "source_summary",
 "command": "run", "source": "moh_bed_waits", "files": 1, "files_skipped": {},
 "rows_read": 6, "parsed": 5, "dropped": 1, "drop_reasons": {"unparseable_value": 1}}
```

`rows_read` always equals `parsed + dropped`. Drop reasons: `blank` (the source cell is empty, e.g. a hospital before its ED opened), `unparseable_value` (a value that could not be read; also logged as a warning), `duplicate_key`, `missing_name`, `no_values`. Whole files that weren't parsed are counted in `files_skipped` (`unchanged`, `not_a_workbook`, `unreadable_workbook`, `no_tables_found`, `not_json`, `load_error`). A source that returned nothing still gets a line with `files: 0`. To pull the summaries out of a log:

```bash
sg-health run 2> run.log && grep '"source_summary"' run.log
```

## 8. Automation

`.github/workflows/weekly_scraper.yml` runs every Sunday at 00:00 UTC (08:00 SGT) and can also be triggered manually. Nothing is committed back to the repo. `data/raw/` is kept between runs as `raw.tar.gz` on a rolling GitHub Release tagged `data-latest`:

1. Run the tests.
2. **Restore** `data/raw/` from the `data-latest` release. On the very first run there is no release yet, so it starts empty. If the release exists but the download fails, the job stops, so an empty `data/raw` can never overwrite history.
3. **Rebuild** the warehouse with `sg-health reparse`.
4. **Fetch** new data with `sg-health run`.
5. **Check** that `manifest.jsonl` has at least as many lines as before; otherwise refuse to upload.
6. **Upload** the grown `raw.tar.gz` to the release, replacing the old one. This happens **before** validation, so a data-quality failure can never lose raw history.
7. **Validate** with `sg-health validate`. If a check blocks publishing, the job fails here. The Excel report is attached to the workflow run as an artifact (kept 30 days) either way.

The warehouse is rebuilt from `data/raw` on every run and is **not** published yet. When publishing is added, it will run only after a passing `validate` step, so the site keeps the last good snapshot whenever a blocking check fails.

To get the data locally:

```bash
gh release download data-latest --pattern raw.tar.gz && mkdir -p data && tar -xzf raw.tar.gz -C data
sg-health reparse
```

Setup:
1. Push this folder to a GitHub repo.
2. Go to **Settings → Actions → General → Workflow permissions** and select **Read and write permissions** (needed to create the release and upload the archive).
3. Optional: add a `DATAGOV_API_KEY` secret and a `SINGSTAT_POP_TABLE_ID` repository variable.
4. Open the **Actions** tab and run the workflow once manually to check it works. The first run creates the `data-latest` release.

**Size:** the archive only grows. Unchanged files are stored once, so most weeks add only the new MOH workbooks and the live-page snapshots. A release asset can be up to 2 GB.

**Live snapshots:** once a week gives you only one NUHS reading per week. For intraday patterns, add a second workflow that runs `--sources live` every 2–3 hours. It must share the `weekly-scraper` concurrency group, because both read and re-upload the same archive.

## 9. Historical backfill (Wayback Machine)

MOH's weekly pages only show the latest week, so history has to come from archived copies:

```bash
sg-health backfill --start 2024-01-01 --max-snapshots 80
```

How it works:
1. It queries the **CDX API** for archived captures of each MOH page (the current URL and the older site's URL), deduplicated by content digest:
   `https://web.archive.org/cdx/search/cdx?url=<page>&output=json&filter=statuscode:200&collapse=digest&from=20240101`
2. It fetches each capture in raw mode (`https://web.archive.org/web/<timestamp>id_/<page>`). The `id_` suffix returns the original HTML without Wayback's link rewriting.
3. It finds the `.xlsx` links and downloads the **archived** copy first, falling back to the live file. MOH may reuse file names for newer data, so the archived copy is the safer bet.
4. Files are deduplicated by SHA-256, and dates come from inside each file, so overlapping weeks merge cleanly.

Tips:
- **Find the files directly.** Archived pages may not have captured every Excel link. You can query the CDX API for the files themselves with a prefix search on the host that serves them (check one live link to see the host): `...cdx?url=<file-host>/<path-prefix>&matchType=prefix&filter=mimetype:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet&output=json`
- **Old URL structure.** MOH's older site used paths like `moh.gov.sg/resources-statistics/healthcare-institution-statistics/...`. Its best-known pattern is in `legacy_urls`; confirm it in the Wayback UI and add any variants you find.
- **Be gentle.** The backfill waits 4–7 s between Internet Archive requests. Run it once, not on a schedule.
- **Other historical sources.** MOH parliamentary replies and annual statistics, plus the data.gov.sg annual series (A&E attendances back to 2007), are useful for long-run trend lines.
- **Fill gaps going forward.** Gaps in coverage are normal. Keep the weekly job running and every week becomes permanent history.

## 10. Ethics and robustness

- Requests are 1.5–3 s apart, with a 15 s timeout, retries with exponential backoff on 429/5xx, and `Retry-After` honoured.
- robots.txt is checked before scraping HTML pages. A disallowed page is skipped and logged, not bypassed. Official APIs (data.gov.sg, SingStat, Wayback CDX) skip the check.
- The User-Agent identifies the crawler and links to the repo.
- If one source breaks, it logs the error and the other sources still run. The CLI exits with an error only if every step fails.
- Cells that can't be parsed become `None` and are dropped before upsert, so they never overwrite good data. Every drop is counted, with its reason, in the source's summary log line.
- Every downloaded file is kept unchanged in `data/raw/`, so a parser bug can be fixed and the history replayed with `sg-health reparse`.

## 11. Assumptions to check on your first live run

The parsers were written against the published structure of each source and tested on synthetic fixtures (`pipeline/tests/`). They have not been run against the live sites from this environment. On your first run, use `-v` and check (after a fix, `sg-health reparse` re-parses everything already downloaded):

- **MOH Excel layout.** The parser handles hospitals-as-columns, dates-as-columns and long layouts, plus time cells, `HH:MM` text and plain numbers. A plain number is read as minutes if the sheet says "min", or if the median is above 24; otherwise as hours. Look for the log line `numeric wait values treated as ...`.
- **NUHS page.** If the static HTML has no tables, the scraper tries a regex text fallback, then Playwright. Site names come from the table header, or from the nearest heading if there isn't one.
- **CHAS GeoJSON.** Attributes are read from the `Description` HTML table. If the field names change, add them to the candidate lists in `normalize_clinics()`.
