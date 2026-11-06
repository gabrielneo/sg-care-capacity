# Data dictionary

Every metric shown to users is defined here, with its unit, source and known caveats. Start with
the marts: they are what the API and site read. Entries for the SingStat population tables are still
written; the population mart below covers what the site uses.

All timestamps are Singapore time (SGT, UTC+8, no daylight saving), stored without a time zone.

## Marts (what the API and site read)

Built by `sg-health transform` from the clean tables (`pipeline/sql/marts/`), via typed staging
views (`pipeline/sql/staging/`). Quarantined rows never reach a mart. Every model's row counts are
reconciled into `transform_log`, and a row lost without a logged reason stops the build.

**`as_of` and `as_of_basis`, on every mart.** `as_of` is when the figure was current, by the best
evidence available. `as_of_basis` says which evidence:

| `as_of_basis` | Meaning | Used by |
|---|---|---|
| `source_updated` | The publisher's own "last updated" time | `dim_clinic` (data.gov.sg `lastUpdatedAt`), `fct_live_ed_snapshot` (NUHS "Last updated at") |
| `fetched` | When we downloaded the file; the publisher gives no per-figure date | `fct_ed_daily`, `fct_ed_weekly` (MOH); fallback for the two above |
| `reference_checked` | When the reference list in code was last verified | `dim_hospital` |
| `reference_period` | The date the statistic describes, set by the publisher | `fct_planning_area_population` (end of June) |

Show `as_of` next to every number. For CHAS it is **2024-06-06** even though the file was
downloaded in November 2026: the clinic list itself is that old.

### `marts.dim_hospital`

**Grain:** one row per MOH-reported site (9). **Source:** the reference in `sg_health/config.py`
(`HOSPITAL_REFERENCE`, `HOSPITAL_CLUSTER`, `HOSPITAL_COVERAGE_NOTE`), seeded into `main.ref_hospital`
on every build. Clusters were checked on 2026-11-06 against NHG Health's corporate profile, MOH's
2017 cluster notice and the Alexandra Hospital and NHG Health records.

| Column | Definition | Unit | Source → transformation | Caveats |
|---|---|---|---|---|
| `hospital_code` | Short code MOH uses in its workbook headers | text | config | `NUH` is MOH's `NUH(A)`. |
| `hospital_name` | Full site name | text | config | AH is named "Alexandra Hospital (UCC)" to make its type visible. |
| `cluster` | Public healthcare cluster: `SingHealth`, `NHG Health` or `NUHS` | text | config | SingHealth: SGH, CGH, SKH. NHG Health: TTSH, KTPH, WH ("NHG" until 1 Jul 2025). NUHS: NUH, NTFGH, AH (since 1 Jun 2018). Unchanged over MOH's series (2023 onward). |
| `facility_type` | `ED` (emergency department) or `UCC` (urgent care centre) | text | config | **AH is a UCC.** Don't rank it against EDs without saying so. |
| `reported_from` | First day MOH reports the site; NULL = from the start of the series (2023-01-01) | date | config | WH from 2024-06-23. Completeness checks don't expect a site before this date. |
| `coverage_note` | What MOH's figures for this site cover, where it isn't obvious | text | config | Set for AH (UCC), NUH (adults only), WH (not yet on MOH's page text). |
| `exclusions_note` | What MOH leaves out of these statistics altogether | text | config | KK Women's and Children's Hospital and NUH Children's Emergency. |
| `source_url` | MOH page the reference was checked against | text | config | |
| `source_sha256` | SHA-256 of the reference rows | text | computed from config | Changes whenever the reference changes, so a build can be traced to its reference. |
| `as_of` | When the reference was last verified | date | `config.REFERENCE_CHECKED` | |
| `as_of_basis` | Always `reference_checked` | text | constant | |

### `marts.fct_ed_daily`

**Grain:** one row per hospital per day. **Source:** MOH *Waiting Time for Admission to Ward* and
*Attendances at Emergency Medicine Departments* (weekly .xlsx) → `moh_bed_waits` /
`moh_ed_attendances` → `staging.stg_moh_*` → FULL OUTER JOIN on hospital and date.

| Column | Definition | Unit | Source → transformation | Caveats |
|---|---|---|---|---|
| `hospital_code` | Site (see `dim_hospital`) | text | staging | Every value is in `dim_hospital` (reconciled). |
| `hospital_name` | Full site name | text | staging | |
| `report_date` | The day the figures describe | date (SGT) | staging | |
| `iso_year`, `iso_week` | ISO 8601 year and week (Monday to Sunday) of `report_date` | integer | DuckDB `isoyear()`, `week()` | 2023-01-01 is ISO 2022-W52. ISO weeks don't align with MOH's Sunday-to-Saturday files. |
| `median_wait_hours` | **MOH's definition:** daily median (50th percentile) waiting time for admission to ward, from *"Decision by doctor to admit patient"* to *"Time patient exits EMD"* (to go to the inpatient ward) | hours | staging, unchanged | **Unit inferred, not stated** by MOH (see the MOH metric entry below). Covers only patients admitted that day. NULL if MOH gave no value (e.g. WH before 2024-06-23): missing, never 0. |
| `attendances` | Patients who presented at the EMD that day, *"regardless of urgency of medical conditions"* (MOH) | patients | staging, renamed from `total_attendances` | Includes non-urgent cases: demand, not acuity. NULL if MOH gave no value. |
| `is_complete_week` | TRUE if this hospital has all 7 days of **both** metrics in this ISO week | boolean | window count over hospital × ISO week | The newest ISO week is usually FALSE (6 of 7 days) until MOH's next file, because MOH files end on Saturday. |
| `dq_flags` | Comma-separated WARN checks this row tripped, e.g. `range.bed_wait_over_24h` | text | `dq_findings` (WARN, row) joined on hospital and date | NULL = no warnings. The row is published; show the flag with it. See `docs/data_quality.md`. |
| `wait_source_url`, `wait_source_sha256` | The raw MOH bed-waits file this day's `median_wait_hours` came from | text | staging lineage | NULL when `median_wait_hours` is NULL. |
| `attendance_source_url`, `attendance_source_sha256` | The raw MOH attendances file this day's `attendances` came from | text | staging lineage | Separate from the wait lineage: the two metrics come from different files. |
| `as_of` | When the later of the two source files was downloaded | timestamp (SGT) | `greatest(wait_fetched_at, attendance_fetched_at)` | MOH gives no per-figure date. MOH restates history weekly; an unchanged file isn't re-parsed, so `as_of` is the first fetch of the file that last changed the row. |
| `as_of_basis` | Always `fetched` | text | constant | |

### `marts.fct_ed_weekly`

**Grain:** one row per hospital per ISO week that has at least one reported day. **Source:**
`marts.fct_ed_daily`, grouped by hospital, `iso_year`, `iso_week`.

| Column | Definition | Unit | Source → transformation | Caveats |
|---|---|---|---|---|
| `hospital_code`, `hospital_name` | Site | text | daily | |
| `iso_year`, `iso_week` | ISO 8601 week | integer | daily | |
| `week_start`, `week_end` | Monday and Sunday of the ISO week | date | `date_trunc('week', …)`, +6 days | |
| `mean_of_daily_median_wait_hours` | **The mean of the daily median waits reported that week.** NOT a weekly median | hours | `avg(median_wait_hours)` over the days reported | MOH publishes only daily medians, and the median of a week's patients can't be derived from them. Say "average of daily medians" wherever it's shown. Uses only the days reported (`days_reported_wait`); missing days are not filled in. |
| `total_attendances` | Sum of daily attendances reported that week | patients | `sum(attendances)` | **Only complete when `days_reported_attendances` = 7.** A partial week is an undercount, not a weekly total: show it with its day count, or not at all. NULL if no day has attendances. |
| `days_reported_wait` | Days in the week with a `median_wait_hours` value | days (0–7) | `count(median_wait_hours)` | |
| `days_reported_attendances` | Days in the week with an `attendances` value | days (0–7) | `count(attendances)` | Counted separately: a week can have 7 of one metric and 6 of the other. |
| `is_complete_week` | TRUE if both day counts are 7 | boolean | | |
| `source_sha256` | Every raw file contributing to the week, comma-separated, sorted | text | distinct wait and attendance hashes | Usually one or two files. |
| `as_of` | Latest `as_of` of the week's days | timestamp (SGT) | `max(as_of)` | |
| `as_of_basis` | Always `fetched` | text | constant | |

### `marts.dim_clinic`

**Grain:** one row per CHAS clinic ever seen (inactive = not in the latest snapshot).
**Source:** data.gov.sg *CHAS Clinics* (GeoJSON, `d_548c33ea2d99e29ec63a7cc9edcccedc`) →
`chas_clinics` → `staging.stg_chas_clinics`, with that dataset's metadata for `as_of`.

| Column | Definition | Unit | Source → transformation | Caveats |
|---|---|---|---|---|
| `clinic_key` | Clinic identifier: the HCI code, or name and postcode if there is none | text | staging | |
| `hci_code` | MOH healthcare institution code | text | staging | |
| `clinic_name`, `address` | As published, tidied for display | text | staging; trimmed and runs of whitespace collapsed to one space | CHAS publishes some names and streets with double spaces (e.g. `BUKIT TIMAH NAM SANG  CLINIC`); wording and case are unchanged, and `staging.stg_chas_clinics` keeps the published text. The address is built from block, street, `#floor-unit` and building when there is no single address field; CHAS sometimes includes the `#` in the floor field, which is not doubled. |
| `postal_code` | 6-digit postcode | text | staging | Kept as text: leading zeros matter. Non-6-digit codes are published with a WARN. |
| `latitude`, `longitude` | Location | degrees (WGS84) | staging, from the GeoJSON point | Rows outside Singapore are quarantined, not corrected (`clinic.coordinates_in_singapore`). |
| `programmes` | Programme codes as published, e.g. `CDMP,CHAS` | text | staging | Real values seen: CHAS, CDMP, ISP. |
| `has_cdmp` | TRUE if the clinic participates in the Chronic Disease Management Programme | boolean | `'CDMP' in programmes` | NULL if `programmes` is missing. |
| `is_active` | TRUE if the clinic is in the latest snapshot | boolean | staging | A clinic quarantined in a later snapshot keeps its last good row, still active. |
| `planning_area_code`, `planning_area` | URA Master Plan 2025 planning area containing the clinic | text | point-in-polygon on `planning_area_boundaries`; name in SingStat's spelling | NULL if the point is in no area or several (see `planning_area_assignment`): never snapped to the nearest area. |
| `planning_area_assignment` | `inside` (in exactly one area), `outside_all` or `ambiguous` | text | point-in-polygon | All 1,192 real clinics are `inside`. |
| `source_url`, `source_sha256` | The raw CHAS file the row came from | text | staging lineage | The signed query string is removed from the URL. |
| `fetched_at` | When that file was downloaded | timestamp (SGT) | staging | |
| `as_of` | When data.gov.sg last updated the CHAS dataset | timestamp (SGT) | metadata `lastUpdatedAt`, matched by the dataset id in `source_url` | **2024-06-06 on the real data**, so clinics opened or closed since then aren't reflected. Falls back to `fetched_at` if metadata is unavailable. |
| `as_of_basis` | `source_updated`, or `fetched` for the fallback | text | | |

**Not included: `on_has`.** The Health Appointment System clinic list was unpublished on
data.gov.sg (checked 2026-11-06) and was never downloaded, so there is nothing to match against.

### `marts.fct_live_ed_snapshot`

**Grain:** one row per NUHS site, department and snapshot. **Source:** the NUHS ED wait-time page
→ `nuhs_live_waits` → `staging.stg_nuhs_live`.

| Column | Definition | Unit | Source → transformation | Caveats |
|---|---|---|---|---|
| `hospital_code` | `NUH`, `NTFGH` or `AH` | text | matched on `site_name` | NULL if NUHS lists a site we don't recognise (the row is kept). |
| `site_name` | Site as named on the page | text | staging | |
| `department` | Page section, e.g. `Adult Emergency`, `Children's Emergency` | text | staging | NUH appears in both. MOH's figures cover NUH **adults only**. |
| `is_adult_ed` | TRUE for an adult emergency section, FALSE for a children's one | boolean | `'adult'` / `'child'` in `department` | **Filter on `is_adult_ed` to show one reading per hospital**: NUH has both sections, and only the adult one matches what MOH's NUH figures cover. NULL if the section name says neither (not guessed). The same rule picks NUH's row for `reconcile.nuhs_vs_moh_nuh`. |
| `measure_type` | Always `estimate` | text | constant | Every figure here is NUHS's live estimate, not a measured statistic. |
| `patients_waiting` | Patients waiting for consultation at that moment | patients | staging | |
| `est_wait_to_see_doctor_hours` | NUHS's estimated wait to see a doctor | hours | staging, renamed from `est_consult_wait_hours` | Whole hours in every reading so far ("1 hour(s)"), so it is coarse. |
| `est_bed_wait_hours` | NUHS's estimated wait for a ward bed | hours | staging | **Not the same measure as MOH's `median_wait_hours`** (a daily median of admitted patients). Compare only side by side, with both labels: see `reconcile.nuhs_vs_moh_nuh`. |
| `snapshot_at` | Time key of the reading: NUHS's "Last updated at" if stated, else our fetch time to the minute | timestamp (SGT) | staging | |
| `source_updated_at` | NUHS's "Last updated at" | timestamp (SGT) | staging | NULL if the page didn't state it. |
| `source_url`, `source_sha256`, `fetched_at` | The raw page snapshot and when it was fetched | text / timestamp | staging lineage | |
| `as_of` | `source_updated_at`, else `fetched_at` | timestamp (SGT) | `COALESCE` | |
| `as_of_basis` | `source_updated` or `fetched` | text | | |

### `marts.fct_planning_area_population`

**Grain:** one row per planning area per year (55 planning areas for 2026). **Source:** SingStat
*Singapore Residents by Planning Area / Subzone, Age Group, Sex and Type of Dwelling, June 2026*
(`respopagesextod2026.csv`) → `pop_65plus_by_area` → `staging.stg_singstat_residents`.

| Column | Definition | Unit | Source → transformation | Caveats |
|---|---|---|---|---|
| `planning_area` | URA planning area | text | SingStat `PA` | Master Plan 2025 boundaries for June 2026. Match to the boundary file by name. |
| `year` | Reference year | integer | SingStat `Time` | |
| `residents_total` | Singapore residents (citizens and permanent residents) living in the area | residents | sum of `Pop` over subzones, ages, sexes, dwelling types | **Each published cell is rounded to the nearest 10**, so a sum carries rounding (SingStat: "may not add up"). Excludes residents away from Singapore for 12+ months. 0 for non-residential areas (e.g. Tuas, water catchments). |
| `residents_65plus` | Residents aged 65 and over | residents | sum of `Pop` for age groups 65–69 … 90 and over | Same rounding. **Includes the "Others" type of dwelling**: 35,280 residents nationally, 20,410 of them aged 65+ (June 2026). SingStat's *Floor Area of Residence* file omits them, which is why it isn't used. |
| `share_65plus` | `residents_65plus / residents_total` | fraction (0–1) | computed | **NULL where there are no residents**, not 0. Small areas are sensitive to the rounding of a few cells. |
| `reference_date` | The date residents are counted at | date | end of June of `year` | |
| `source_table` | SingStat file the figures came from | text | data CSV name | |
| `source_url`, `source_sha256`, `fetched_at` | The raw zip and when it was downloaded | text / timestamp | staging lineage | |
| `as_of` | `reference_date` | timestamp | | The figures describe end-June; SingStat generated the file on 2026-09-25. |
| `as_of_basis` | Always `reference_period` | text | constant | |

### `marts.fct_clinic_access`

**Grain:** one row per planning area (55), for the latest SingStat year. **Source:**
`marts.dim_clinic` (active clinics, by planning area) joined to `marts.fct_planning_area_population`
on planning-area name (case-insensitive; 55 of 55 match), over `staging.stg_planning_area_boundaries`.

| Column | Definition | Unit | Source → transformation | Caveats |
|---|---|---|---|---|
| `planning_area_code` | URA planning-area code | text | boundaries | |
| `planning_area` | Planning area, SingStat spelling | text | population mart | |
| `region_name` | URA region | text | boundaries | |
| `population_year` | Year of the resident counts | integer | latest year in the population mart | |
| `residents_total`, `residents_65plus` | Residents, and residents aged 65+ | residents | population mart | Rounded per published cell (see that mart). |
| `active_chas_clinics` | Active CHAS clinics located in the area | clinics | count of `dim_clinic` with `is_active` | **0 is a real zero** (the CHAS list is complete), not missing. Quarantined clinics are not counted. |
| `active_cdmp_clinics` | Of those, clinics in the Chronic Disease Management Programme | clinics | count with `has_cdmp` | |
| `cdmp_clinics_per_1000_65plus` | **Lead measure.** `1000 × active_cdmp_clinics / residents_65plus` | clinics per 1,000 residents aged 65+ | computed | **NULL where no one aged 65+ lives** (no denominator). Counts where clinics *are*, not where patients live: residents cross area lines, so low values in small or central areas aren't necessarily poor access. **Mixed vintages:** clinics June 2024, residents June 2026. |
| `chas_clinics_per_1000_65plus` | Same for all active CHAS clinics | clinics per 1,000 residents aged 65+ | computed | Same caveats. |
| `clinics_as_of` | When the CHAS list was last updated | timestamp (SGT) | `dim_clinic.as_of` | 2024-06-06 on the real data. |
| `population_as_of` | Population reference date | timestamp | population mart | End of June of `population_year`. |
| `clinic_source_sha256`, `population_source_sha256`, `boundary_source_sha256` | The raw files behind each part | text | lineage | |
| `as_of` | The **older** of `clinics_as_of` and `population_as_of` | timestamp | `least(...)` | So the page never claims the measure is more current than its oldest input. |
| `as_of_basis` | Basis of whichever input is older (`source_updated` for the clinic list today) | text | | |

### `marts.dim_metric`

**Grain:** one row per published metric. **Source:** `sg_health/metrics.py`, seeded into
`main.ref_metric` on every build. The site reads labels, units and caveats from here, so the same
caveat appears wherever a metric does.

| Column | Definition | Unit | Source → transformation | Caveats |
|---|---|---|---|---|
| `metric_id` | `mart.column` the metric lives in | text | metrics.py | A test checks each one exists. |
| `label` | Display name | text | metrics.py | |
| `definition` | What is measured; the publisher's wording where it gives one | text | metrics.py | |
| `unit` | Unit of the values | text | metrics.py | |
| `unit_basis` | `stated` (the publisher names the unit) or `inferred` (we deduced it) | text | metrics.py | **MOH bed waits are `inferred`**: show the caveat with them. |
| `caveat` | Text to show with the metric | text | metrics.py | |
| `source_name` | Publisher and dataset, for display | text | metrics.py | |
| `source_sha256` | SHA-256 of the metric definitions | text | computed | Changes whenever a definition changes. |
| `as_of` | When the definitions were last checked | date | `metrics.METRICS_CHECKED` | |
| `as_of_basis` | Always `reference_checked` | text | constant | |

## Source tables

The clean tables the marts are built from.

### MOH emergency department metrics

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
`pop_65plus_by_area`, `annual_ae_attendances` and `source_metadata` carries these three columns. None of them may be null.

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
| `source` | text | Raw source name, which decides the parser: `moh_bed_waits`, `moh_ed_attendances`, `nuhs_live`, `datagov_chas`, `datagov_annual_ae`, `datagov_metadata`, `singstat_residents`, or `moh_page` (stored, not parsed). Older files may also carry the retired sources `singhealth_qwatch`, `datagov_has` and `singstat` (kept, not parsed). |
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
| `datagov_planning_areas` | OK | URA Master Plan 2025 Planning Area Boundary (No Sea), `d_2cc750190544007400b2cfd5d7f53209`, updated upstream 2026-02-27: 55 areas, names match SingStat 55 of 55. Not collection 2104 (that is the 2019 edition). |
| `datagov_annual_ae` | OK | 1984–2023; only 2023 overlaps the daily MOH series. Reconciliation only. |
| `singstat_residents` | OK | June 2026, 55 planning areas: 4,240,430 residents, 828,010 aged 65+ (19.5%). Updated yearly around September; the URL in `config.py` must be updated then. |

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
