# Singapore Healthcare Capacity Pipeline

A weekly ETL pipeline that tracks hospital strain in a super-aged Singapore. It collects ED bed-wait and attendance figures from MOH, live ED and X-ray wait times, clinic locations and the 65+ population. Everything lands in a DuckDB warehouse, with a formatted Excel summary on top.

Only aggregate data about institutions, places and populations is collected. There is no personal or patient-level data.

```
sources ──► PoliteHttp (retries, rate limit, robots.txt) ──► parsers ──► DuckDB (upsert) ──► Excel report
  MOH weekly .xlsx · NUHS live · SingHealth QWatch · data.gov.sg · SingStat · Wayback (backfill)
```

## 1. Install

```bash
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m playwright install chromium                   # optional: only for JS-rendered pages
pytest -q                                               # offline tests, no network needed
```

Or, for a minimal install without the Playwright fallback:

```bash
pip install requests beautifulsoup4 lxml pandas openpyxl duckdb
```

## 2. Run

```bash
python sg_health_pipeline.py run                          # all sources, then the report
python sg_health_pipeline.py run --sources moh,opendata   # a subset
python sg_health_pipeline.py report                       # rebuild the Excel report from the DB
python sg_health_pipeline.py -v run --sources live        # verbose logging
```

Optional environment variables:

| Variable | Purpose |
|---|---|
| `CRAWLER_USER_AGENT` | Your bot's identity. Point it at your public repo URL, not a personal email. |
| `DATAGOV_API_KEY` | data.gov.sg API key, for higher rate limits (free; register on data.gov.sg). |
| `SINGSTAT_POP_TABLE_ID` | SingStat Table Builder ID for "residents by planning area and age group" (see below). |

**Finding the SingStat table ID:** search [tablebuilder.singstat.gov.sg](https://tablebuilder.singstat.gov.sg) for a table of residents by planning area and age group. The ID is in the table's URL. Pass it with `--singstat-table <ID>` or set the env var. The code flattens any Table Builder JSON into `singstat_tabledata`. It then sums age bands of 65 and over per planning area into `pop_65plus_by_area`. Check that derived table against the source the first time.

## 3. Warehouse schema (`singapore_healthcare.duckdb`)

| Table | Key | Contents |
|---|---|---|
| `moh_bed_waits` | hospital_name, report_date | Daily median wait from the decision to admit until the patient leaves the ED (hours) |
| `moh_ed_attendances` | hospital_name, report_date | Daily ED attendances |
| `chas_clinics` | clinic_key (HCI code) | Name, address, postal code, lat/long, `has_cdmp`, programmes, `is_active` |
| `has_clinics` | clinic_key | Clinics on the Health Appointment System, plus a `raw_json` copy of the source row |
| `nuhs_live_waits` | site_name, snapshot_timestamp | Patients waiting, estimated consult and bed waits (hours) |
| `singhealth_xray_waits` | site_name, snapshot_timestamp | X-ray queue wait (minutes) or CLOSED |
| `singstat_tabledata` | table_id, row_label, column_path | Raw flattened SingStat cells |
| `pop_65plus_by_area` | planning_area, year | Derived 65+ residents per planning area |
| `ingestion_log` | sha256 | Every file loaded, so an unchanged file is never parsed twice |

All tables use `INSERT OR REPLACE` on their key, so re-running the pipeline never duplicates rows. Clinic tables are full snapshots: rows missing from the latest download are kept, with `is_active = FALSE`. All timestamps are SGT.

Example query:

```sql
-- Which EDs had the worst week?
SELECT hospital_name, ROUND(AVG(median_wait_hours), 1) AS avg_wait_h,
       SUM(total_attendances) AS attendances
FROM moh_bed_waits b JOIN moh_ed_attendances a USING (hospital_name, report_date)
WHERE report_date >= current_date - INTERVAL 7 DAY
GROUP BY 1 ORDER BY 2 DESC;
```

## 4. Automation

`.github/workflows/weekly_scraper.yml` runs every Sunday at 00:00 UTC (08:00 SGT) and can also be triggered manually. It runs the tests and the pipeline, then commits `data/singapore_healthcare.duckdb` and `reports/SG_Healthcare_Scrape_Report.xlsx` back to the repo.

Setup:
1. Push this folder to a GitHub repo.
2. Go to **Settings → Actions → General → Workflow permissions** and select **Read and write permissions**.
3. Optional: add a `DATAGOV_API_KEY` secret and a `SINGSTAT_POP_TABLE_ID` repository variable.
4. Open the **Actions** tab and run the workflow once manually to check it works.

**Repo size:** committing a binary DuckDB file every week grows git history. This is fine for a portfolio (a few MB a year). If it gets large, use Git LFS for `*.duckdb`, or publish the DB as a release asset and commit Parquet exports instead.

**Live snapshots:** once a week gives you only one NUHS/QWatch reading per week. For intraday patterns, add a second workflow that runs `--sources live` every 2–3 hours. Have it write to a separate small DB or CSV, so the weekly snapshot doesn't churn.

## 5. Historical backfill (Wayback Machine)

MOH's weekly pages only show the latest week, so history has to come from archived copies:

```bash
python sg_health_pipeline.py backfill --start 2024-01-01 --max-snapshots 80
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

## 6. Ethics and robustness

- Requests are 1.5–3 s apart, with a 15 s timeout, retries with exponential backoff on 429/5xx, and `Retry-After` honoured.
- robots.txt is checked before scraping HTML pages. A disallowed page is skipped and logged, not bypassed. Official APIs (data.gov.sg, SingStat, Wayback CDX) skip the check.
- The User-Agent identifies the crawler and links to the repo.
- If one source breaks, it logs the error and the other sources still run. The CLI exits with an error only if every step fails.
- Cells that can't be parsed become `None` and are dropped before upsert, so they never overwrite good data.

## 7. Assumptions to check on your first live run

The parsers were written against the published structure of each source and tested on synthetic fixtures (`tests/`). They have not been run against the live sites from this environment. On your first run, use `-v` and check:

- **MOH Excel layout.** The parser handles hospitals-as-columns, dates-as-columns and long layouts, plus time cells, `HH:MM` text and plain numbers. A plain number is read as minutes if the sheet says "min", or if the median is above 24; otherwise as hours. Look for the log line `numeric wait values treated as ...`.
- **NUHS page.** If the static HTML has no tables, the scraper tries a regex text fallback, then Playwright. Site names come from the table header, or from the nearest heading if there isn't one.
- **CHAS GeoJSON.** Attributes are read from the `Description` HTML table. If the field names change, add them to the candidate lists in `normalize_clinics()`.
