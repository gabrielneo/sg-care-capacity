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

**What the site shows as "Data as of".** The site and its CSV downloads show each **source's** as_of
from the snapshot's `manifest.json` (`sources.<id>.as_of`, with its basis), not a mart row's
`as_of` column. The two differ for MOH:

| | MOH (`moh_bed_waits`, `moh_ed_attendances`) | Other sources |
|---|---|---|
| Mart column `as_of` (lineage) | When the file was downloaded (`fetched`), e.g. 2026-11-06 14:51 | As in the table above |
| Shown as "Data as of" | The latest `report_date` (basis "latest report_date"), e.g. 2026-10-31 | The same value as the mart column |

The latest report date is what a reader needs: the last day the figures describe. The download
time stays in the mart for lineage. A figure that combines sources shows each source's own date;
a finding also states the end of the window it tests ("This finding uses data to …"), which is
the insight's own `as_of`. Found by the independent audit (`audit_report.md`, M-5).

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
| `planning_area_code`, `planning_area` | URA Master Plan 2025 planning area containing the clinic | text | point-in-polygon in SVY21 (`sg_health/geo.py`); name in SingStat's spelling via `ref_area_name_map` | NULL if the point is in no area or several (see `planning_area_assignment`): never snapped to the nearest area. |
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
| `est_wait_to_see_doctor_hours` | NUHS's estimated wait to see a doctor | hours | staging, renamed from `est_consult_wait_hours` | Whole hours in every reading so far ("1 hour(s)"), so it is coarse. When `est_wait_to_see_doctor_qualifier` is set, this is a bound, not a value. |
| `est_bed_wait_hours` | NUHS's estimated wait for a ward bed | hours | staging | **Not the same measure as MOH's `median_wait_hours`** (a daily median of admitted patients). Compare only side by side, with both labels: see `reconcile.nuhs_vs_moh_nuh`. |
| `est_wait_to_see_doctor_qualifier` | `<` or `>` when NUHS published a bound for the wait to see a doctor ("< 1 hour(s)"); NULL for a plain value | `<`, `>` or NULL | staging, from the page's cell (renamed from `est_consult_wait_qualifier`) | With `<`, the hours column holds the bound: "< 1 hour(s)" is stored as 1 with `<`, and shown as "under 1 hour". Flagged by `live.bounded_estimate`. |
| `est_bed_wait_qualifier` | `<` or `>` when NUHS published a bound for the bed wait; NULL for a plain value | `<`, `>` or NULL | staging, from the page's cell | As above. A bounded bed wait is left out of every comparison (the NUHS-vs-MOH chart, `reconcile.nuhs_vs_moh_nuh`, the `source_gap` finding). |
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

### `marts.fct_area_access`

**Grain:** one row per URA Master Plan 2025 planning area (55), for the latest SingStat year.
Replaces `fct_clinic_access`. **Sources:** `marts.dim_clinic`, `marts.fct_planning_area_population`,
`staging.stg_planning_area_boundaries`, `staging.stg_polyclinics`. Names are joined through the
explicit map `main.ref_area_name_map` (55 of 55 exact matches; any mismatch stops the build).
Distances and areas are computed in **SVY21 (EPSG:3414)** by `sg_health/geo.py`; see
[methodology.md](methodology.md). Every area is kept: if population is missing, population and
ratios are NULL and the blocking check `completeness.population_present` fails.

| Column | Definition | Unit | Source → transformation | Caveats |
|---|---|---|---|---|
| `planning_area_code` | URA planning-area code | text | boundaries | |
| `planning_area` | Planning area, SingStat spelling | text | name map; URA's name if population is missing | |
| `region_name` | URA region | text | boundaries | |
| `population_year` | Year of the resident counts | integer | latest year in the population mart | |
| `residents_total`, `residents_65plus` | Residents, and residents aged 65+ | residents | population mart | Rounded per published cell (see that mart). |
| `chas_clinics` | Active CHAS clinics located in the area | clinics | count of `dim_clinic` with `is_active`, placed by point-in-polygon in SVY21 | **0 is a real zero** (the CHAS list is complete). Quarantined clinics are not counted. |
| `cdmp_clinics` | Of those, clinics in the Chronic Disease Management Programme | clinics | count with `has_cdmp` | |
| `clinics_per_1k_seniors` | `1000 × chas_clinics / residents_65plus` | CHAS clinics per 1,000 residents aged 65+ | computed | NULL where no one aged 65+ lives. Counts where clinics *are*, not where patients live. Mixed vintages: clinics June 2024, residents June 2026. |
| `cdmp_clinics_per_1k_seniors` | **Lead measure.** `1000 × cdmp_clinics / residents_65plus` | CDMP clinics per 1,000 residents aged 65+ | computed | Same caveats. |
| `area_km2` | Area of the URA planning-area polygon | km² | SVY21 polygon area | URA "no sea" boundary area, **not** Singapore's official land area: water catchments and island groups contribute much of the 797 km² total (official land is about 735 km²). Matches geodesic area within 0.002%. |
| `pct_area_within_1km_of_cdmp` | Share of the area within 1 km straight-line of any active CDMP clinic in Singapore | % of area | union of 1 km SVY21 buffers around every active CDMP clinic (across area borders too), intersected with the polygon | **An area-based proxy, not people**: parks, catchments and industrial land count as much as housing estates. Straight-line, not travel time. NULL if no clinic data is loaded. |
| `approx_km_centroid_to_nearest_polyclinic` | Straight-line distance from the polygon's geometric centroid to the nearest polyclinic | km | SVY21 distance to each polyclinic, minimum | **Approximate**: one point for the whole area, and the centroid may sit away from where people live (or outside the area, see `centroid_in_area`). Polyclinic list is HPB's screening-centre proxy. NULL if no polyclinic list is loaded. |
| `nearest_polyclinic` | Name of that polyclinic | text | as above | |
| `centroid_in_area` | TRUE if the centroid lies inside the area's own polygon | boolean | SVY21 | FALSE for Western Islands (scattered islands). |
| `dq_note` | Area-specific caveats for the map tooltip, `;`-separated | text | rules in `fct_area_access.sql` | NULL when there is nothing particular. Notes: population not loaded; no residents; no residents aged 65+; fewer than 1,000 aged 65+ (ratios unstable); no CDMP clinic inside the area; centroid outside the area. SingStat **rounds** small counts (to 10) rather than suppressing them, so no area is "suppressed". |
| `clinics_as_of`, `population_as_of` | When the clinic list was last updated; the population reference date | timestamp | | |
| `clinic_source_sha256`, `population_source_sha256`, `boundary_source_sha256`, `polyclinic_source_sha256` | The raw files behind each part | text | lineage | |
| `as_of` | The **older** of `clinics_as_of` and `population_as_of` | timestamp | `least(...)` | |
| `as_of_basis` | Basis of whichever input is older | text | | |

### Web map layer: `data/build/web/planning_area_access.geojson`

A GeoJSON FeatureCollection written after every successful transform, for the site's choropleth.
**One feature per planning area (55)**, geometry in **WGS84 (EPSG:4326)**, simplified from the URA
Master Plan 2025 polygons in SVY21 with shared borders kept (see
[methodology.md](methodology.md)). Under 1 MB (342 KB at a 5 m tolerance today); coordinates to 5
decimals (about 1 m).

**Properties** are the `marts.fct_area_access` columns of the same name: `planning_area_code`,
`planning_area`, `region_name`, `population_year`, `residents_total`, `residents_65plus`,
`chas_clinics`, `cdmp_clinics`, `clinics_per_1k_seniors`, `cdmp_clinics_per_1k_seniors`,
`pct_area_within_1km_of_cdmp`, `approx_km_centroid_to_nearest_polyclinic`, `nearest_polyclinic`,
`dq_note`, `as_of`, `as_of_basis`. Decimals are rounded to 4 places. **Missing values are `null`**
(never `0` or `NaN`): style them as "no data", not as the lowest class. `metadata` records the
boundary source and its hash, the CRS, the tolerance used and a pointer to the methodology.

Two more properties come from the insight engine's own access-gap code
(`insights/detectors/access_gap.py`), so the map and the findings can't disagree:

| Property | Definition | Unit | Caveats |
|---|---|---|---|
| `excluded_reason` | Why the area is left out of the access-gap ranking: `no residents aged 65+`, or `fewer than 1,000 residents aged 65+` (`thresholds.yml`); null if it is ranked | text | A clinic or two moves a small area's ratio a lot, so these areas are drawn flat and grey on the 3D map. |
| `cdmp_shortfall` | CDMP clinics the national rate would give the area's residents aged 65+, minus the CDMP clinics it has. The national rate is all CDMP clinics over all residents aged 65+ | clinics, 2 decimals | **Negative means more than the national rate.** Null for excluded areas and missing counts. Clinics are counted where they are, not where patients go. |

Caveat: rounding coordinates after simplification leaves 52 m² of gaps and 49 m² of overlap in total
across all 55 areas (invisible at map scale; a test fails above 1,000 m²).

### 3D map layer: `data/build/web/planning_area_access_svy21.geojson`

The same 55 areas, with the same simplified borders and properties, **in SVY21 metres (EPSG:3414)**,
so the 3D map builds its shapes without any projection in the browser. Written with the web layer
after every transform; about 250 KB.

- **Coordinates:** whole metres, translated so Singapore's centre is (0, 0):
  `x = easting − origin[0]`, `y = northing − origin[1]`. `metadata.origin` holds the offset, so the
  real SVY21 coordinates can always be recovered.
- **Extra properties:** `label_x`, `label_y`, a point inside the area (shapely's representative point,
  in the same translated metres) for the 3D map's floating labels.
- **Checks:** every shape must still be valid after rounding to whole metres, or the transform
  stops.

### `main.ref_area_name_map`

The explicit match between boundary-file and population planning-area names, rebuilt on every
transform. One row per boundary area.

| Column | Definition | Unit | Source → transformation | Caveats |
|---|---|---|---|---|
| `planning_area_code` | URA planning-area code | text | boundaries | |
| `boundary_name` | Name in the URA boundary file (upper case) | text | boundaries | |
| `population_name` | Matching SingStat name | text | exact match after normalising case and whitespace | NULL only if no population is loaded (`match_method` = `population_missing`). Any other mismatch **stops the build** with the names listed. |
| `match_method` | How the pair was matched | text | | `exact_after_case_and_space_normalisation` for all 55 today. |

### `marts.fct_insight`

**Grain:** one row per published insight. **Source:** the insight engine (`pipeline/sg_health/insights/`), run
after transform and before publish, from `fct_ed_weekly`, `fct_ed_daily`, `fct_area_access`,
`fct_live_ed_snapshot` and `dim_hospital`. Only insights that pass their statistical gate are rows; every test
run, published or not, is in `insights.json` (`candidates`). Method per detector:
[insights_method.md](insights_method.md).

| Column | Definition | Unit | Source → transformation | Caveats |
|---|---|---|---|---|
| `insight_id` | Stable id: detector, entity, variant, window and as-of date, hashed | text | engine | The same data gives the same id. |
| `type` | Detector: `trend`, `anomaly`, `weekday`, `volume_vs_wait`, `access_gap`, `regional`, `source_gap` | text | engine | |
| `entity` | What the insight is about: a hospital code, a planning area, or `All hospitals` | text | engine | |
| `headline` | One sentence, at most 20 words, plain language | text | `templates.yml` | Checked when written: no causal words, no column names. |
| `detail` | At most two sentences | text | `templates.yml` | Same checks. |
| `metric_value` | The measured value (slope, week's value, peak-day mean, correlation, area ratio, median gap) | see `unit` | detector | Rounded to 4 decimals. |
| `unit` | Unit of `metric_value` and `comparison_value` | text | detector | |
| `comparison_value` | What `metric_value` is compared with (window median, usual level, weekly mean, national rate) | see `unit` | detector | NULL where there is no comparison. |
| `direction` | `better`, `worse` or `neutral`, for the metric's own sense (a longer wait is worse) | text | detector | |
| `effect_size` | The detector's effect: Kendall's tau, robust z, epsilon-squared, Spearman rho, priority score, median gap | number | detector | Not comparable across detectors; `rank_score` is. |
| `p_value` | The test's p-value | probability | scipy | NULL for descriptive detectors (anomaly, access_gap, regional). |
| `p_adjusted` | Benjamini-Hochberg adjusted p-value, across every test in the run | probability | engine | Published only below `alpha` (0.05). |
| `n` | Observations behind the insight (weeks, days, pairs, seniors) | count | detector | |
| `method` | The method, in words | text | detector | |
| `caveats` | What to keep in mind, including data checks that set records aside | list of text | engine | |
| `who_acts`, `action` | Suggested owner and action, from `docs/insight_actions.yml` | text | engine | **NULL until the author marks the entry `reviewed: true`**; a caveat says so. |
| `evidence` | `{endpoint, query}`: the API endpoint and SQL that reproduce the figure | struct | engine | |
| `as_of` | The latest data date the insight uses | date | engine | The clinic list date for access gaps. |
| `as_of_basis` | `latest_data` or `source_updated` | text | engine | |
| `rank_score` | normalised effect x (1 - p_adjusted) x completeness x recency | 0-1 | `ranking.py` | Recency from the source's freshness (green 1, amber 0.7, red 0.4). |
| `headline_rank` | 1-3 for the headline findings (highest scores, at most one per detector), else NULL | integer | `ranking.py` | |
| `display` | `{value_text, unit_text, metric_label, comparison_label, change, change_word}`: the key number as text, rounded as in the headline, and the labels the site shows around it | struct | detector (`value_text`, `unit_text`, `change`); `templates.yml` (labels) | `change` is `up`, `down` or NULL (the arrow); colour comes from `direction`. `comparison_label` is NULL where the comparison isn't in the same unit (trend, correlation). Labels pass the same word checks, at most 12 words. |
| `chart` | `{kind, y_label, x_label, points[{key, label, value}], highlight, callout, reference{value, label}, trend_line{first, last}}`: the values the detector tested, for the site's chart | struct | detector; `callout` from `templates.yml` | A missing week is a point with a NULL value (a gap, never 0). `highlight` names the points the callout points at. For `volume_vs_wait` the bars are days in five equal groups by visits, each bar the group's **median** bed wait (so the y-label says "Median"), a description of the tested pairs, not a second test. |

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

### `pop_65plus_by_subzone` (warehouse table)

| | |
|---|---|
| **Grain** | One row per subzone per year: 332 subzones in 55 planning areas for June 2026. Primary key `(planning_area, subzone, year)`. |
| **Source** | The same SingStat file as `pop_65plus_by_area` (*… Type of Dwelling, June 2026*), summed per `PA, SZ, Time` instead of `PA, Time`. |
| **Columns** | `planning_area`, `subzone`, `year`, `residents_total`, `residents_65plus`, `source_table`, plus lineage. Definitions and units as in `marts.fct_planning_area_population`. |
| **Caveats** | **Not published yet**: no mart or page uses it, and no subzone boundaries are loaded, so it can't be mapped. Each cell is rounded to 10, so small subzones are dominated by rounding; 90 subzones have no residents (0, kept). Each planning area equals the sum of its subzones exactly (`population.area_equals_sum_of_subzones`), because both are sums of the same cells. |

## Lineage columns (on every parsed table)

Every row in `moh_bed_waits`, `moh_ed_attendances`, `chas_clinics`, `nuhs_live_waits`,
`pop_65plus_by_area`, `pop_65plus_by_subzone`, `annual_ae_attendances` and `source_metadata` carries these three columns. None of them may be null.

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
- For `pop_65plus_by_area` and `pop_65plus_by_subzone`, lineage points at the SingStat file the figure was
  derived from (the same file and sha256 for both).

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
| `http_status` | integer | HTTP status of the response. **Empty when the bytes did not come from an HTTP response:** a page rendered with Playwright, or the SingStat reference file read from `data/reference/` (its `url` is SingStat's download link as provenance, and its `sha256` matches SingStat's file). |
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
| `datagov_polyclinics` | OK, a proxy | HPB *Cervical Screening Centre* (`d_3ca2a28059588f297908b32da4ac3cbe`, Jan 2026) used as the polyclinic list: all 26 polyclinics. Not a polyclinic register: a new polyclinic appears only once HPB lists it for screening. MOH's *Vaccination_Polyclinics* has only 8 and isn't used. |
| `datagov_annual_ae` | OK | 1984–2023; only 2023 overlaps the daily MOH series. Reconciliation only. |
| `singstat_residents` | OK | June 2026, 55 planning areas: 4,240,430 residents, 828,010 aged 65+ (19.5%). Read only from the committed reference copy `data/reference/singstat/respopagesextod2026.zip` (downloaded by hand: SingStat refuses GitHub's runners), loaded only if its SHA-256 matches `config.SINGSTAT_RESIDENTS_SHA256`. Yearly refresh each September: see `docs/runbook.md`. |

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
