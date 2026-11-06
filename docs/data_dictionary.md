# Data dictionary

Every metric shown to users is defined here, with its unit, source and known caveats.
Entries for the CHAS, NUHS and SingStat metrics are still to be written.

All timestamps are Singapore time (SGT, UTC+8, no daylight saving), stored without a time zone.

## MOH emergency department metrics

**Publisher:** Ministry of Health, *Healthcare Institution Statistics*. Each workbook's footnote
gives the underlying source as "Weekly Hospital Submissions". Files are published weekly (week
*N* covers Sunday to Saturday) with a `Historical` sheet from 2023-01-01 and a sheet for the
latest week. Definitions below are quoted from the MOH pages (checked 2026-11-06).

**Coverage.** MOH lists: the **Urgent Care Centre** at Alexandra Hospital (AH), and the Emergency
Medicine Departments of CGH, KTPH, NUH (**adults only**, `NUH(A)`), NTFGH, SKH, SGH and TTSH.
KK Women's and Children's Hospital and NUH (Children) are **excluded**. The workbooks also carry
**Woodlands Hospital (WH)** from **2024-06-23**, which the MOH page text does not list yet.

| Hospital code | `hospital_name` | Notes |
|---|---|---|
| AH | Alexandra Hospital (UCC) | An urgent care centre, **not a full ED**. Lower attendances and waits are expected; don't rank it against EDs without saying so. |
| CGH, KTPH, NTFGH, SGH, SKH, TTSH | full names | Emergency Medicine Departments. |
| NUH | National University Hospital | **Adult ED only.** Children's ED is excluded by MOH. |
| WH | Woodlands Hospital | Series starts 2024-06-23. Earlier days are blank in the source and are **not stored** (missing, not zero). |

### `moh_bed_waits.median_wait_hours`

| | |
|---|---|
| **Definition** | Daily median (50th percentile) waiting time for admission to ward: from *"Decision by doctor to admit patient"* to *"Time patient exits EMD"* (to go to the inpatient ward). |
| **Unit** | Hours, stored to 2 decimal places. |
| **Grain** | One value per hospital per day. |
| **Source** | MOH, *Waiting Time for Admission to Ward* (weekly .xlsx). |
| **Caveats** | **The unit is inferred, not stated.** Neither the workbook nor the page names it; cells are plain decimals shown to one decimal place. Hours is the only plausible reading (median about 4; minutes would mean 4-minute bed waits), but confirm with MOH before quoting figures externally. It is a **median of patients admitted that day**: it says nothing about patients who were not admitted, and it can't be averaged across hospitals without patient counts. |

### `moh_ed_attendances.total_attendances`

| | |
|---|---|
| **Definition** | Daily attendances at the EMD. *"Daily attendance figures include all patients who are presented at the EMD regardless of urgency of medical conditions."* |
| **Unit** | Patients (count) per day. |
| **Grain** | One value per hospital per day. |
| **Source** | MOH, *Attendances at Emergency Medicine Departments* (weekly .xlsx). |
| **Caveats** | Includes non-urgent cases, so it measures demand on the department, not acuity. AH is an urgent care centre (see above). |

### `annual_ae_attendances.attendances`

| | |
|---|---|
| **Definition** | Total attendances at public-sector Accident & Emergency departments in the year (series `level_1 = "Accident & Emergency Departments"`). |
| **Unit** | Patients (count) per year. |
| **Grain** | One value per year, 1984–2023 as of 2026-11-06. |
| **Source** | MOH via data.gov.sg, *Hospital Admissions And Public Sector Outpatient Attendances, Annual* (`d_a5267c58f60b20f8e04576261abfac93`). |
| **Caveats** | **Used only to reconcile** the daily MOH series (`reconcile.annual_ae`), not shown as a headline metric. Covers all public-sector A&E departments, **including** KKH and NUH Children's, which MOH's daily figures exclude, so the daily total is expected to be lower (−17.3% in 2023). The 2022 and 2023 values are rounded to the nearest hundred, unlike earlier years; they may be provisional. |

## Lineage columns (on every parsed table)

Every row in `moh_bed_waits`, `moh_ed_attendances`, `chas_clinics`, `nuhs_live_waits`,
`singstat_tabledata`, `pop_65plus_by_area` and `annual_ae_attendances` carries these three columns. None of them may be null.

| Column | Type | Definition |
|---|---|---|
| `source_url` | text | The URL the row's raw file was downloaded from. For a Wayback Machine copy this is the `web.archive.org/web/<timestamp>id_/…` URL. For data.gov.sg downloads the signed query string is removed, because it is a short-lived credential. |
| `source_sha256` | text | SHA-256 of the raw file's bytes. Together with `source_url` it identifies one row of `raw_manifest`, and the file is at `data/raw/<source>/<date>/<source_sha256>.<ext>`. |
| `ingested_at` | timestamp (SGT) | **When the raw file was fetched**, i.e. when this data entered the pipeline. It is *not* the time the parser last ran. That keeps `reparse` reproducible: replaying the same raw files gives identical rows. |

**Caveats**

- A row's key can appear in more than one raw file (for example, overlapping MOH weeks). The row
  keeps the lineage of the **last** file that wrote it, in fetch order.
- An MOH file that is downloaded again unchanged (same sha256) is not parsed again, so its rows keep
  the `ingested_at` of the first fetch.
- Clinic and live-page snapshots are reloaded on every fetch, so their `ingested_at` is the most
  recent fetch that contained the row.
- For `pop_65plus_by_area`, lineage points at the SingStat file the figure was derived from.

## `raw_manifest`

One row per fetch, including fetches that returned bytes already stored. The source of truth is
the append-only file `data/raw/manifest.jsonl`; this table is a copy of it, rebuilt on every run
and on `reparse`.

| Column | Type | Definition |
|---|---|---|
| `seq` | integer | Position in `manifest.jsonl`, from 0. This is the replay order. |
| `source` | text | Raw source name, which decides the parser: `moh_bed_waits`, `moh_ed_attendances`, `nuhs_live`, `datagov_chas`, `datagov_annual_ae`, `singstat`, or `moh_page` (stored, not parsed). Older files may also carry the retired sources `singhealth_qwatch` and `datagov_has` (kept, not parsed). |
| `url` | text | Where the bytes came from (see `source_url` above). |
| `sha256` | text | SHA-256 of the bytes. |
| `bytes` | integer | Size in bytes. |
| `http_status` | integer | HTTP status of the response. **Empty for a page rendered with Playwright**, which has no HTTP response of its own. |
| `content_type` | text | The `Content-Type` header, as sent by the server. |
| `fetched_at` | timestamp (SGT) | When the fetch finished. |
| `path` | text | Location of the file, relative to `data/raw/`. |

**Caveats**

- Only responses with data are recorded. Failed requests (network errors, HTTP 4xx/5xx), robots.txt,
  data.gov.sg poll responses and Wayback CDX listings are not landed.
- Identical bytes are stored once per source, under the date they were first fetched. Later
  fetches of the same bytes add a manifest row that points at that first file.

## Source status

Checked 2026-11-06. Update this table whenever a source changes.

| Raw source | Status | Notes |
|---|---|---|
| `moh_bed_waits` | OK | 2023-01-01 to 2026-10-31, 9 hospitals (Woodlands from 2024-06-23). Unit inferred as hours; see the metric entry above. |
| `moh_ed_attendances` | OK | Same hospitals and date range as bed waits. |
| `nuhs_live` | OK | The page has one table per department (Adult Emergency, Children's Emergency). NUH appears in both, so `department` is part of the key. |
| `datagov_chas` | OK, but **stale upstream** | Dataset `d_548c33ea2d99e29ec63a7cc9edcccedc` (collection 2036): 1,193 clinics, 1,049 with CDMP. data.gov.sg reports it **last updated 2024-06-06**. Clinics that opened or closed since then are not reflected. |
| `datagov_has` | **Retired** (not fetched) | Dataset `d_3cd840069e95b6a521aa5301a084b25a` is unpublished (`DATASET_DOES_NOT_EXIST`), no replacement is named, and it isn't needed for the project. |
| `singhealth_qwatch` | **Retired** (not fetched) | `/patient-care/xrayqwatch` redirects to the SingHealth homepage. It was polyclinic X-ray queues, outside the project's scope. |
| `datagov_annual_ae` | OK | 1984–2023; only 2023 overlaps the daily MOH series. Reconciliation only. |
| `singstat` | Not configured | Needs `SINGSTAT_POP_TABLE_ID`. |

## Data-quality tables

See [data_quality.md](data_quality.md) for every check, its threshold and the reasoning.

### `quarantine_<table>`

One per gated table (`quarantine_moh_bed_waits`, `quarantine_chas_clinics`, ...). Rows that failed
an ERROR check, **never** present in the clean table.

| Column | Type | Definition |
|---|---|---|
| `row_key` | text | The row's primary key as JSON, e.g. `{"clinic_key": "19M0103"}`. |
| `check_ids` | text | Comma-separated ERROR checks the row failed. |
| `details` | text | What each check found. |
| *every column of the clean table* | text | The values **exactly as parsed**, stored as text so a value of the wrong type still fits. Lineage columns say which raw file it came from. |

Kept current per key: a later good value for the same key clears the row. Rebuilt by `reparse`.

### `dq_findings`

Every current failure from the load gate, ERROR or WARN, row or file level. Rebuilt by `reparse`.

| Column | Type | Definition |
|---|---|---|
| `table_name` | text | The clean table checked. |
| `check_id` | text | The check that failed. |
| `severity` | text | `ERROR` or `WARN`. |
| `scope` | text | `row` (one row) or `file` (a whole file or sheet). |
| `row_key` | text | Primary key as JSON for a row finding; empty for a file finding. |
| `failing_rows` | integer | 1 for a row finding; rows (or columns) covered for a file finding. |
| `detail` | text | What was found, with the offending value. |
| `source_url`, `source_sha256` | text | The raw file checked. |

### `dq_results`

One row per check per `sg-health validate` run (also written at the end of `sg-health run`).
**Append-only**: it is the history of data quality over time and is not rebuilt by `reparse`.

| Column | Type | Definition |
|---|---|---|
| `check_id` | text | The check. |
| `table` | text | The table it applies to. |
| `severity` | text | `ERROR` or `WARN`. |
| `status` | text | `pass`, `fail`, or `skipped` (no rows to check yet). |
| `failing_rows` | integer | Rows (or, for completeness, missing days) that failed. |
| `details` | text | Up to 10 examples, or the measured value (e.g. data age, reconciliation gap). |
| `run_id` | text | `YYYYMMDDTHHMMSS-xxxxxx`, shared by every row of one run. |
| `checked_at` | timestamp (SGT) | When the run happened. |
| `scope` | text | `row`, `file` or `dataset`. |
| `blocks_publish` | boolean | Whether a failure of this check blocks publishing (ERROR at file or dataset scope). |
