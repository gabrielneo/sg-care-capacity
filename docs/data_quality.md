# Data quality

Every number this project publishes passes through a set of automated checks first. This page
lists each check: what it guards against, its threshold, and why that threshold was chosen.
Thresholds were tested against the real data on 2026-11-06; the "On real data" notes give
what each check found then.

Run them with `sg-health validate`. A test fails if a check exists in code but is missing from
this page.

## How it works

```
raw file ──► parser ──► load gate ─┬─► clean table          rows that passed (or only WARNed)
                                   ├─► quarantine_<table>   rows that failed an ERROR check
                                   └─► dq_findings          every failure, ERROR or WARN
sg-health validate ──► dataset checks on clean tables ──► dq_results (one row per check per run)
```

- **The gate never changes a value.** A row either passes through untouched or is withheld.
  Rebuilding from the real raw files with the gate in place left every clean table identical
  to the pre-gate build except for the one clinic described under
  `clinic.coordinates_in_singapore`.
- **Quarantined rows keep their original values** (stored as text, so even a value of the wrong
  type fits) plus `check_ids` and `details`. They never reach the clean tables.
- **State is current, per key.** When a later file supplies a good value for a key, its old
  quarantine row and findings are cleared. When a later file supplies a bad value, the clean
  table keeps the last good one. `reparse` rebuilds the quarantine tables and `dq_findings`
  from `data/raw`. `dq_results` is an append-only log of validation runs and is kept.

### Severities and what blocks publishing

| Severity | Scope | Effect |
|---|---|---|
| ERROR | row | The row is quarantined. **Does not block publishing:** the bad row is already excluded, and the site shows how many rows were excluded. |
| ERROR | file / dataset | Every row the check covers is quarantined (file) or the table is unusable (dataset). **Blocks publishing.** `sg-health validate` exits 1 and the site keeps serving the last good snapshot. |
| WARN | any | Rows are published. The finding is shown on the site next to the affected figure. |

Row-level ERRORs don't block because one bad upstream record would otherwise stop all
publishing until the publisher fixed it. The CHAS dataset, for example, was last updated in
June 2024.

### Reading the results

```bash
sg-health validate                       # summary table; exit code 1 = publish blocked
```

```sql
SELECT * FROM dq_results WHERE run_id = (SELECT max(run_id) FROM dq_results);   -- latest run
SELECT * FROM dq_findings WHERE check_id = 'range.bed_wait_over_24h';           -- which rows
SELECT * FROM quarantine_chas_clinics;                                          -- what was withheld
```

`validate` statuses are `pass`, `fail` and `skipped` (no rows to check yet). In the summary, a
failing check shows as `FAIL (blocks)`, `FAIL (quarantined)` or `WARN`.

### Fixing a failure

1. Find the rows: `dq_findings` has the key and the source file (`source_url`, `source_sha256`).
2. Open the raw file in `data/raw/` and decide: source error, or parser error?
3. **Parser error:** fix the parser and run `sg-health reparse`; history is re-parsed and
   re-checked. **Source error:** leave it quarantined and note it under *Known source issues*
   below. Never edit a value by hand: missing stays missing.

---

## Schema checks (every gated table)

Gated tables: `moh_bed_waits`, `moh_ed_attendances`, `chas_clinics`, `nuhs_live_waits`,
`pop_65plus_by_area`, `annual_ae_attendances`, `source_metadata`, `planning_area_boundaries`.

### `schema.required_columns`: ERROR, file, blocks

- **Guards against:** a parser that silently stops producing a column after a source layout
  change, so the table would fill with NULLs.
- **Threshold:** every `NOT NULL` column of the table (lineage excepted, which the loader adds)
  is present in the parsed rows. If not, the whole file is quarantined.
- **Why:** a missing column means the parse itself is wrong, not one value, so nothing from
  that file can be trusted.

### `schema.required_values`: ERROR, row

- **Guards against:** a row with no key or no identifying field, e.g. a bed wait with no date.
- **Threshold:** every `NOT NULL` column has a value.
- **Why:** such a row can't be placed anywhere; storing it would mean inventing the missing part.

### `schema.types`: ERROR, row

- **Guards against:** text in a numeric column, a date that isn't a date, a fractional count.
- **Threshold:** each value converts to its column's DuckDB type. Integers must be whole numbers.
- **Why:** without this, one bad cell makes the database cast fail and the whole file is lost.
  Checking per row keeps the good rows.

### `schema.duplicate_key`: ERROR, row

- **Guards against:** one file stating two different values for the same key (e.g. the same
  hospital and day on two sheets with different figures).
- **Threshold:** copies with **identical** values are merged (counted as `duplicate_key` in the
  log, not a failure). Copies with **different** values are **all** quarantined.
- **Why:** before the gate, the parser silently kept the last copy. With conflicting copies we
  can't know which is right, so neither is published.

## Domain checks (MOH tables)

### `domain.hospital_code`: ERROR, row

- **Guards against:** a row attributed to a hospital outside the reference list.
- **Threshold:** `hospital_code` is one of AH, CGH, KTPH, NUH, NTFGH, SKH, SGH, TTSH, **WH**
  (`config.HOSPITAL_REFERENCE`, which also records each site's type and first reporting date).
- **Why:** charts and comparisons are built per hospital. AH is an Urgent Care Centre, not a
  full ED, and NUH means its adult ED only. Woodlands (WH) is included: MOH's workbooks carry it
  from 2024-06-23, though MOH's page text doesn't list it yet.

### `domain.report_date_not_future`: ERROR, row

- **Guards against:** a mistyped year or a mis-parsed day-first date that lands in the future.
- **Threshold:** `report_date` is not after the date the raw file was **fetched**.
- **Why:** a figure dated after its own download is impossible. Comparing with the fetch date
  rather than today keeps `reparse` reproducible: the same files always give the same result.

### `domain.unrecognised_hospital_column`: WARN, file

- **Guards against:** a new hospital column that the parser silently ignores.
- **Threshold:** any header cell in an MOH sheet that isn't the date column, a known hospital or
  a deliberately excluded one (KKH, children's EDs).
- **Why:** this is how Woodlands was missed for 861 days: its `WH` header matched no pattern and
  the column was skipped without being counted as dropped. Now it would be reported on the
  first run. WARN, because the known hospitals in the same sheet are still correct.

## Range checks

### `range.bed_wait_bounds`: ERROR, row

- **Guards against:** impossible bed waits: negative values, or values far beyond any plausible
  ED stay.
- **Threshold:** `0 <= median_wait_hours <= 72`.
- **Why:** a *median* wait above three days for a day's admissions isn't a real operational
  state. The highest value MOH has published since 2023 is 42.1 h (KTPH, 2023-03-13).

### `range.bed_wait_over_24h`: WARN, row

- **Guards against:** exceptional but possible values being shown without context.
- **Threshold:** `median_wait_hours > 24` (and up to 72).
- **Why:** a median admitted patient waiting over a day is a story in itself. Readers should see
  it flagged rather than mistake it for an error. **On real data:** 63 days, mostly KTPH in
  March 2023.

### `range.attendances_negative`: ERROR, row

- **Guards against:** a negative attendance count.
- **Threshold:** `total_attendances >= 0`.
- **Why:** counts can't be negative. A negative usually means a correction row or a bad cell.

### `range.attendances_rolling_4sd`: WARN, dataset

- **Guards against:** a single day's attendance count that is wildly out of line for that
  hospital (a typo, a partial day).
- **Threshold:** outside the mean ± 4 standard deviations of the **previous 56 days** (8 weeks)
  for the same hospital. Days with fewer than 56 prior days aren't evaluated.
- **Why:** each hospital is compared with its own recent history, so a small UCC and a large ED
  are judged on their own scale. 4 SD keeps it to genuine outliers. **On real data:** 4 days,
  including **AH on 2023-09-08: 7 attendances** against a usual ~64.

## Unit checks (minutes vs hours)

MOH's bed-wait sheets **don't state their unit**. The parser reads them as hours (median about
4; minutes would mean 4-minute bed waits). A wrong unit decision changes **every value in a sheet
by exactly 60×**, so the checks look for that signature per sheet, not for a single hospital's
movement.

### `unit.file_vs_stored`: ERROR, file, blocks

- **Guards against:** a sheet parsed in the wrong unit when we already hold data for the same days.
- **Threshold:** compare the sheet with stored clean values for the same hospital-days (at least
  7). A median ratio above **20×** or below **1/20×** quarantines the whole sheet.
- **Why:** MOH repeats its full history from 2023 in every weekly file, so almost every new file
  overlaps what we hold. Same units give a ratio of ~1.0, a unit error gives 60 or 1/60. 20×
  sits far from both, so it raised **no false alarms** on the real data and **missed none** of
  the simulated unit errors.

### `unit.sheet_plausible`: ERROR, file, blocks

- **Guards against:** a wrong unit on a **first load**, or in a new week with nothing to compare.
- **Threshold:** the sheet's median bed wait is between **0.25 h and 24 h**.
- **Why:** across every hospital in a sheet, the median is a robust check. Minutes read as hours
  gives ~240; hours read as minutes gives ~0.07.

### `unit.weekly_shift_10x`: WARN, dataset

- **Guards against:** an abrupt change in one hospital's level that may be a reporting change.
- **Threshold:** a hospital's weekly (Sun–Sat) median bed wait above 10× or below 1/10× of its
  trailing 4-week median.
- **Why WARN and not ERROR:** on real data this flags **CGH in the weeks of 8 and 15 Feb 2026**
  (0.58–0.79 h against ~8 h). The figures are MOH's own: a gradual dip over five weeks with
  normal attendances, while SGH and SKH dipped too (Chinese New Year). Blocking on it would have
  withheld real data. It also missed 5 of 1,687 simulated unit errors. The two file-level checks
  above catch unit errors; this one surfaces unusual movement for a human to look at.

## Completeness and freshness (MOH tables)

### `completeness.moh_week_7_days`: WARN, dataset

- **Guards against:** missing days silently shown as gaps, or worse, averaged over.
- **Threshold:** every expected hospital has 7 daily values in every MOH week (Sunday to
  Saturday), from its first reporting date (WH from 2024-06-23) to the latest date in the table.
  The details list each hospital-week with gaps.
- **Why:** missing means missing. A weekly average over 5 days isn't comparable to one over 7.
  Quarantined rows count as missing here, which is deliberate. **On real data:** no gaps in
  1,723 hospital-weeks.

### `freshness.moh_14_days`: WARN, dataset · `freshness.moh_28_days`: ERROR, dataset, blocks

- **Guards against:** publishing stale figures as if current, e.g. if MOH moves its page and
  the scraper quietly finds nothing.
- **Threshold:** latest `report_date` more than **14 days** old is a WARN; more than **28 days**
  is an ERROR.
- **Why:** MOH publishes weekly, about 4–6 days after the week ends. 14 days means one missed
  week, worth a warning. 28 days means about four missed weeks: the pipeline is broken, and the
  site should keep the last good snapshot rather than present old data as current.

## Clinic checks (`chas_clinics`)

### `clinic.coordinates_in_singapore`: ERROR, row

- **Guards against:** clinics plotted in the sea or another country, which would distort access
  analysis by planning area.
- **Threshold:** latitude **1.15–1.48**, longitude **103.6–104.1** (Singapore including its
  southern islands). Missing coordinates fail too.
- **Why:** a wrong location puts the clinic in the wrong planning area. We don't geocode from
  the postcode to "fix" it, because that would be inventing a value. **On real data:** one
  clinic, "DA clinic @ Taman Jurong" (postcode 610410), is recorded at latitude 1.016 (in the
  sea); Taman Jurong is at about 1.33. It's quarantined. A clinic quarantined in a later
  snapshot keeps its last good row **active**, since it's still listed upstream.

### `clinic.postal_code_6_digits`: WARN, row

- **Guards against:** malformed postcodes.
- **Threshold:** exactly 6 digits.
- **Why WARN:** location comes from the coordinates, so a clinic with good coordinates and a bad
  postcode can still be mapped. **On real data:** all 1,193 pass.

### `clinic.count_vs_previous`: WARN, file

- **Guards against:** a truncated or partial download that looks like mass clinic closures.
- **Threshold:** the snapshot's clinic count is within **±10%** of the previous snapshot's.
- **Why:** clinics join and leave CHAS one at a time, so a swing of more than 10% between
  snapshots is more likely a bad download than reality. It can be real (e.g. a scheme change),
  so it warns rather than blocks. The threshold is a judgement, not fitted to data: the CHAS
  file hasn't changed since June 2024, so there is no churn history to measure yet.

## Population checks (`pop_65plus_by_area`)

### `population.counts_consistent`: ERROR, row

- **Guards against:** a planning area with more residents aged 65+ than residents in total, or a
  negative count, which would give a share over 100% or below 0 on the access page.
- **Threshold:** `0 <= residents_65plus <= residents_total`.
- **Why:** these are two sums of the same published cells; any other result means the file was
  read wrongly.

### `population.planning_area_count`: WARN, file

- **Guards against:** a truncated file, or SingStat switching to new planning-area boundaries
  without us noticing.
- **Threshold:** **55** planning areas per year (URA Master Plan 2025, which SingStat uses for
  June 2026).
- **Why WARN:** a boundary change is real, not an error, but planning-area names would no longer
  match the boundary file used for the map, so someone must look.

The parser itself also **stops** (the file is not loaded) if the columns aren't exactly
`PA, SZ, AG, Sex, TOD, Pop, Time`, an age group is unknown, or a count isn't a number. That's how
picking up SingStat's *Floor Area of Residence* file by mistake would be caught: it has an `FA`
column instead of `TOD`, and it leaves out about 20,000 residents aged 65+.

### `freshness.population_15_months`: WARN, dataset

- **Guards against:** showing an old population count as current because nobody updated the
  pinned SingStat file link.
- **Threshold:** the newest reference date (30 June of the latest `year`) is more than **15
  months** before today.
- **Why:** SingStat publishes each June edition around September, so a correctly updated pipeline
  is never more than about 15 months behind. The file link is pinned in
  `config.SINGSTAT_RESIDENTS_URL` and updated by hand once a year, on purpose: discovering it
  automatically from SingStat's page would break silently whenever the page is redesigned.

## Boundary checks (`planning_area_boundaries`)

### `boundary.geometry_valid`: ERROR, row

- **Guards against:** a broken or misplaced polygon putting clinics in the wrong planning area,
  or in none.
- **Threshold:** each planning area's geometry is a readable, valid, non-empty Polygon or
  MultiPolygon lying inside Singapore's bounding box (lat 1.15–1.48, lon 103.6–104.1).
- **Why:** clinics are counted per area by point-in-polygon. An invalid shape can make that test
  wrong silently. All 55 real areas pass (extent lon 103.606–104.089, lat 1.159–1.471).

### `boundary.planning_area_count`: WARN, file

- **Guards against:** a partial boundary file, or a Master Plan change that the population data
  doesn't follow yet.
- **Threshold:** **55** planning areas.
- **Why WARN:** fewer areas would leave clinics unassigned (shown as `outside_all`, not snapped
  to a neighbour); more would mean new areas without a SingStat population.

How clinics are placed: each clinic's point must be **inside exactly one** area. None, or more
than one, leaves the area NULL with `planning_area_assignment` = `outside_all` or `ambiguous`; it
is never assigned to the nearest area. On the real data all 1,192 clinics are inside exactly one.

## Reconciliation (WARN only)

### `reconcile.annual_ae`: WARN, dataset

- **Guards against:** MOH's daily series drifting from the official annual totals (missing
  hospitals, double counting).
- **Threshold:** for each year with at least 180 days of daily data, the annualised daily total
  (total × days in year ÷ days present) is within **25%** of MOH's annual A&E series
  (`annual_ae_attendances`, data.gov.sg `d_a5267c58f60b20f8e04576261abfac93`).
- **Why 25%:** the two don't cover the same sites. The annual series counts all public-sector
  A&E departments, while MOH's daily figures exclude KK Women's and Children's Hospital and NUH
  Children's ED. **On real data:** only **2023** overlaps (the annual series ends there):
  868,644 against 1,050,400, **−17.3%**, consistent with those exclusions. 25% allows for that
  structural gap and would still catch a hospital disappearing from the daily data. The annual
  series' 2022 and 2023 values are rounded to the nearest hundred, so they may be provisional.

### `reconcile.nuhs_vs_moh_nuh`: WARN, dataset, informational

- **Guards against:** misreading the live NUHS estimate as the same measure as MOH's median.
- **Threshold:** none. For each NUHS adult-ED snapshot on a day MOH has published, it reports the
  live estimate, MOH's NUH median, the direction (above/below) and the gap in hours. It never fails.
- **Why:** the live figure is an estimate at one moment; MOH's is the median over the day's
  admitted patients. They should move together but needn't match. Showing the gap side by side
  is the honest comparison. Skipped until MOH publishes a day for which a live snapshot exists.

---

## Known source issues

| Source | Issue | Handling |
|---|---|---|
| CHAS (data.gov.sg) | "DA clinic @ Taman Jurong" (19M0103) recorded at lat 1.016, lon 103.582 | Quarantined by `clinic.coordinates_in_singapore`. |
| CHAS (data.gov.sg) | Dataset last updated 2024-06-06 | Documented in the data dictionary; affects how current the clinic map is. |
| MOH bed waits | Unit not stated in the workbook or on the page | Read as hours; guarded by the unit checks. Confirm with MOH before quoting externally. |
| MOH attendances | AH 2023-09-08 shows 7 attendances (usual ~64) | Published, flagged by `range.attendances_rolling_4sd`. |
| MOH bed waits | CGH weeks of 8 and 15 Feb 2026 near 0.6–0.8 h | Published, flagged by `unit.weekly_shift_10x`; confirmed as MOH's own figures. |
| CHAS (data.gov.sg) | 7 names and 2 street names with double spaces | Tidied for display in `dim_clinic`; published text kept in staging. |
| SingStat residents | Every cell rounded to the nearest 10 | Planning-area sums carry rounding; see the data dictionary. |
