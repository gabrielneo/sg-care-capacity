# Data accuracy audit: Right-siting care in a super-aged Singapore

**Date:** 2026-11-08
**Auditor note:** independent; implementation not read. Every figure below was recomputed with the auditor's own Python (stdlib, duckdb, pandas, pyarrow, openpyxl) from the raw files and staging tables. No pipeline, API or web source code, SQL, tests or other project docs were opened. The only project doc read was `docs/data_dictionary.md`. The case study was read through the website.

**Inputs audited**

| Input | Identity |
|---|---|
| Published snapshot | `data-2026-11-08`, manifest `created_at` 2026-11-08T22:31:13, `pipeline_commit` 9df9c098…, check run `20261108T223112-0a9d18` |
| Raw zone | `data/raw/manifest.jsonl`: 54 lines (seq 0–53), 4 fetch rounds (2026-11-06 14:51, 2026-11-06 16:33, 2026-11-08 13:27, 2026-11-08 22:30). One unique MOH bed-wait file (`cc679084…`) and one MOH attendance file (`15f6ef55…`) back every MOH row |
| Staging | `staging_tables.duckdb`, schema `staging` (8 tables), opened read-only |
| Site | Local production build at http://127.0.0.1:3320, serving that snapshot (footer: "Data release data-2026-11-08, as of 8 Nov 2026"). Pages fetched with curl, then rendered with a headless Chromium (`--dump-dom`) so client-rendered sections were included |

Auditor scripts and scratch output are in `/private/tmp/claude-501/-Users-neoyikai-wamp64-www/eed29896-3cac-406a-83ce-e11b04d50057/scratchpad/audit/auditor/` (`parse_moh.py`, `cmp_daily.py`, `weekly.py`, `access.py`, `access_cmp.py`, `nuhs.py`, `findings.py`, `kw.py`, `draw20.py`, `trace20.py`; rendered pages in `rendered/`, CSV downloads in `csv/`).

---

## Summary

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 1 |
| Medium | 5 |
| Low | 9 |
| Info | 6 |

**Verdict.** The core numbers are accurate. Every one of the 12,061 daily MOH rows matches the raw workbooks (values rounded to 2 dp, half-even). Every one of the 1,732 weekly rows matches an independent recomputation exactly. All 55 planning-area rows match on counts, ratios, areas, distances and polyclinic names. Coverage-within-1 km matches within grid error (≤0.08 points at a 10 m grid). The published findings (weekday peaks, the Alexandra anomaly, the Spearman correlations and the access gaps) reproduce to the displayed precision. 19 of the 20 randomly drawn displayed numbers trace to a raw cell and match; the 20th is an external citation. MOH has no missing days in this snapshot except Woodlands before 2024-06-23. Those days are blank in the raw file, are not stored and are drawn as a gap. Nothing was filled in.

The one accuracy defect is on the NUHS side. NUHS publishes some readings as **"< 1 hour(s)"**. The pipeline stores these as **1.0**, and the site shows them as **"1 hour"** and **"1.0 h"**. Three readings in the current snapshot are affected, on `/live` and `/ed-trends`. The remaining issues are about provenance and labelling rather than wrong values: as_of and freshness labels that disagree between pages for the same source, a wrong as_of under the NUHS/MOH chart, and a findings CSV that dates clinic-access findings to the MOH week.

---

## Findings ranked by severity

### C-1 (Critical) NUHS "< 1 hour(s)" readings are stored and shown as exactly 1 hour

- **Where:** `/live` (Alexandra Hospital: "Estimated wait to see a doctor 1 hour", "Estimated wait for a ward bed 1 hour"; NUH Children's Emergency: "Estimated wait for a ward bed 1 hour"). `/ed-trends`, chart "NUHS estimate and MOH figure": "AH 1.5 h → 1.0 h", aria-label "AH: MOH 1.5 hours, NUHS 1.0 hours". Mart `marts.fct_live_ed_snapshot` and `staging.stg_nuhs_live`.
- **Evidence:** the raw page `data/raw/nuhs_live/2026-11-08/08dcdda582b911be6b44fbeca73c8fe573aa1cdc4d9058ada710d8c1f9f02dc6.html` (sha256 `08dcdda5…02dc6`, "Last updated at 08 Nov 2026, 10:00:44 PM") has these `<td>` cells:
  - Adult Emergency › Estimated Wait Time to See Doctor › Alexandra Hospital: `< 1 hour(s)`
  - Adult Emergency › Estimated Bed Wait Time › Alexandra Hospital: `< 1 hour(s)`
  - Children's Emergency › Estimated Bed Wait Time › National University Hospital: `< 1 hour(s)`

  Mart and staging both hold `est_wait_to_see_doctor_hours = 1.0` and `est_bed_wait_hours = 1.0` for those rows (query: `select site_name, department, est_wait_to_see_doctor_hours, est_bed_wait_hours from staging.stg_nuhs_live where source_sha256 like '08dc%'`). The other 45 NUHS cells across all 4 raw pages parse correctly (`nuhs.py`). The upper bound "< 1" becomes a point value of 1, which is the highest the true value can be. Nothing flags it. This is the snapshot the site serves as "latest".
- **Suggested fix:** parse a leading `<` as a censored value: keep it NULL, or keep the bound in a separate qualifier column (for example `est_bed_wait_qualifier = '<'`, bound 1). Display it as "under 1 hour". Add a row-level DQ check for any non-numeric prefix. Avoid ".0" precision for whole-hour estimates in the slope chart.

### H-1 (High) The NUHS-vs-MOH chart's provenance line gives the MOH date for both halves

- **Where:** `/ed-trends` (and `/ed-trends?hospital=NUH&hospital=NTFGH&hospital=AH`), section "NUHS estimate and MOH figure".
- **Evidence:** the footer reads "Data as of 31 Oct 2026 · Source: NUHS, MOH", with badge "Up to date · weekly data, 8 days old". The right-hand values (AH 1.0 h, NTFGH 6.0 h, NUH 12.0 h) are NUHS readings with `as_of` 2026-11-08 22:00:44 (`fct_live_ed_snapshot`; manifest `sources.nuhs_live.as_of`). The subtitle does say "NUHS estimate: 8 Nov 2026, 10:00 pm SGT", which partly mitigates. Still, the provenance line and freshness badge (weekly cadence, 8 days) misdescribe half the figures. The case study's success metric "Provenance … All … Met" is therefore overstated.
- **Suggested fix:** for mixed-source charts, give one as_of per source ("MOH as of 31 Oct 2026; NUHS as of 8 Nov 2026, 10:00 pm") and a badge per source.

### M-1 (Medium) Findings show the MOH source as "Due an update, 2 weeks old" while other pages call it "Up to date, 8 days old"

- **Where:** `/` (all three finding cards and the hero) and `/summary`. Compare `/ed-trends` and `/data-quality`.
- **Evidence:** on `/`: "Data as of 25 Oct 2026 · Source: MOH", badge amber "Due an update · weekly data, 2 weeks old". On `/ed-trends` and `/data-quality` › Freshness: "Data as of 31 Oct 2026 … Up to date · weekly data, 8 days old" (green). Same source, same snapshot. Manifest `sources.moh_bed_waits.as_of` = 2026-10-31. 25 Oct is the end of the findings' last complete ISO week (`fct_insight.as_of` = 2026-10-25), so the date is defensible as "finding as of". The freshness badge built on it is not: it tells readers the MOH data is stale when it is current.
- **Suggested fix:** label the date "Finding uses data to 25 Oct 2026", and base the freshness badge on the source's as_of (31 Oct).

### M-2 (Medium) The findings CSV dates access-gap findings to the MOH week and lists every source on every row

- **Where:** `/export/findings.csv`.
- **Evidence:** all 28 rows have `data_as_of = 2026-10-25` and the same `source` ("data.gov.sg, CHAS Clinics; MOH, Waiting Time…; MOH, Attendances…; SingStat…"). For the 10 `access_gap` rows (Hougang, Sengkang, …), `finding_as_of` is correctly 2024-06-06, but `data_as_of` says 2026-10-25 and the source includes MOH. ED findings list CHAS and SingStat, which they don't use.
- **Suggested fix:** derive `data_as_of` and `source` per finding from the sources that finding actually uses (CHAS 2024-06-06 + SingStat 2026-06-30 for access gaps; MOH for ED findings).

### M-3 (Medium) Manifest check counts don't match the run they cite, or the site

- **Where:** `snapshot/manifest.json` › `checks`; `/data-quality` ("Checks run on this data release 77"); `/case-study` ("0 of 77 checks").
- **Evidence:** the manifest says `run_id 20261108T223112-0a9d18`, counts pass 70 / fail 1 / warn 3 / skipped 1 = **75**. In `analytics.duckdb` › `main.dq_results`, that run has **77** rows (70 pass, 4 fail, 3 skipped). The 75 total matches the earlier run `20261108T223109-3b1352` (70 / 4 / 1). The extra two are the insight gates `insight.regional.all` and `insight.source_gap.nuh` (skipped).
- **Suggested fix:** write the manifest counts from the same run as `run_id`, or record both runs (validation and insights) separately.

### M-4 (Medium) A quarantined CDMP clinic is left out; its effect on the Jurong West finding isn't stated

- **Where:** `marts.dim_clinic` / `fct_area_access`; `/access-map` "Clinics short of the national rate" (Jurong West "about 4"); findings `access_gap-8b31583338`.
- **Evidence:** raw CHAS file `datagov_chas/2026-11-06/d25ed5c5….geojson`, feature index 270: HCI_CODE 19M0103, "DA clinic @ Taman Jurong", POSTAL_CD 610410, CLINIC_PROGRAMME_CODE `CDMP,CHAS,ISP`, X_COORDINATE/Y_COORDINATE `0.0`/`0.0`, geometry (103.5818, 1.0163). It is correctly quarantined (`clinic.coordinates_in_singapore`), so the national CDMP count is 1,048 rather than the raw 1,049 and the national rate is 1.2657 per 1,000. The name and postcode suggest Jurong West, but the auditor did not geocode the postcode. If it is in Jurong West, the shortfall would be 46,400 × 1,049/828,010 − 56 = 2.78 ("about 3") rather than the published 3.73 ("about 4"). The site discloses "1 record in the CHAS clinic list was set aside", but not that it is a CDMP clinic or which area it probably belongs to.
- **Suggested fix:** add the quarantined clinic's programmes and probable area to the caveat on access-gap findings. Optionally place it by postcode, flagged as such.

### M-5 (Medium) The dictionary says MOH `as_of` is the fetch time; the site and CSVs show the latest report date

- **Where:** `docs/data_dictionary.md` (`fct_ed_daily.as_of`, `fct_ed_weekly.as_of`: "When the later of the two source files was downloaded", basis `fetched`; "Show `as_of` next to every number"). Site and CSV `data_as_of`.
- **Evidence:** the mart has `as_of = 2026-11-06 14:51:53`, `as_of_basis = 'fetched'` on all 12,061 daily rows and all 1,732 weekly rows. The site shows "Data as of 31 Oct 2026", and `/export/ed-daily.csv` and `/export/ed-weekly.csv` carry `data_as_of = 2026-10-31`. The manifest uses basis "latest report_date". What users see is arguably the better date, but it is not the mart's documented `as_of`.
- **Suggested fix:** update the dictionary to say the site displays the latest report date (and why), or show the mart value. Keep one definition.

### L-1 (Low) Headline labels say "Average bed wait" where the dictionary asks for "average of daily medians"

- **Where:** `/` and `/summary`: "Average bed wait on Tuesdays 12.7 hours"; "Average bed wait, week of 19–25 Oct 2026 2.1 hours".
- **Evidence:** the dictionary's `mean_of_daily_median_wait_hours` entry says: "Say 'average of daily medians' wherever it's shown." The chart axes do ("Hours, average of the daily medians on that weekday"; "Hours, average of each day's median"), so the meaning is close by, but the KPI label alone reads as a mean wait of patients.
- **Suggested fix:** "Average of daily median bed waits, Tuesdays".

### L-2 (Low) The volume-vs-wait chart plots group medians without saying so

- **Where:** `/` Finding 3 chart ("Quietest −0.5 … Busiest +0.5"; callout "1.0 hour longer").
- **Evidence:** recomputed from raw: NUH days 2026-04-27..2026-10-25, visits(t) and wait(t+1) each minus their weekday median, 181 pairs sorted into ntile groups of 37/36/36/36/36. The group **medians** are exactly −0.545, −0.4725, 0.0925, 0.335, 0.465 (they match `fct_insight.chart.points`). Group **means** would be −0.32, −0.50, 0.40, 0.84, 1.38, a 1.7-hour spread rather than 1.0. The y-label "Bed wait the day after, hours vs usual for that weekday" and the dictionary's `chart` entry don't say "median".
- **Suggested fix:** y-label "Median bed wait the day after, hours vs usual for that weekday".

### L-3 (Low) Weekday table gives the wrong reason for deselected hospitals

- **Where:** `/ed-trends?hospital=WH&hospital=AH&from=2024-06-01&to=2024-07-15&mode=raw`.
- **Evidence:** "Not shown, with fewer than 4 complete weeks in the window: CGH, KTPH, NTFGH, NUH, SGH, SKH…". These hospitals were simply not selected. Each has 26 complete weeks in the 2026-04-27..2026-10-25 window the table uses.
- **Suggested fix:** list only selected hospitals that fail the threshold.

### L-4 (Low) The ED Trends loading skeleton announces a chart that never renders

- **Where:** `/ed-trends` server HTML: a skeleton section "Bed wait and emergency department visits on the same day". It is absent from the rendered page, which shows 4 sections.
- **Suggested fix:** remove the skeleton, or render the chart.

### L-5 (Low) "No data" is shown where the ratio is undefined, not missing

- **Where:** `/access-map?view=table`: the 13 areas with 0 residents aged 65+ (Boon Lay, Central Water Catchment, Changi Bay, Lim Chu Kang, Marina East, Marina South, North-Eastern Islands, Paya Lebar, Pioneer, Simpang, Straits View, Tuas, Western Islands) show "No data" in both ratio columns.
- **Evidence:** residents are known (0) and the dq_note says "No residents: ratios not applicable". Calling it "No data" blurs real missingness, which the site otherwise keeps distinct.
- **Suggested fix:** show "n/a (no residents)".

### L-6 (Low) Data Quality page badges use a single-source cadence for a whole-release date

- **Where:** `/data-quality` summary cards and the Freshness table footer: "Data as of 8 Nov 2026 …", badge title "published yearly: up to date within 15 months".
- **Suggested fix:** label the release date as the release date, with no cadence badge.

### L-7 (Low) The warning count differs for the same MOH figures

- **Where:** `/` finding cards: "4 data-quality warnings apply to these figures". `/ed-trends`: "3 data-quality warnings apply".
- **Evidence:** the manifest lists 3 WARN failures for MOH tables plus 1 ERROR (CHAS quarantine). The home count probably includes the CHAS item, which does not apply to the ED findings shown.
- **Suggested fix:** count only checks on the tables the figure uses.

### L-8 (Low) The case study calls Alexandra's UCC an ED

- **Where:** `/case-study`, problem statement: "The 8 public EDs MOH reported throughout recorded 868,644 ED visits in 2023…".
- **Evidence:** the figure is correct (sum of 8 columns AH–TTSH). AH is an Urgent Care Centre, and the site elsewhere insists on that ("AH is a UCC. Don't rank it against EDs without saying so").
- **Suggested fix:** "The 8 sites (7 EDs and Alexandra's UCC) MOH reported throughout…".

### L-9 (Low) Equal rounded values still get a direction arrow

- **Where:** `/ed-trends?mode=raw`, "latest week against usual": "WH 4.4 hours vs 4.4 usual ▼ lower than usual (better)" and "CGH 3.4 hours vs 3.4 usual ▲ higher than usual (worse)".
- **Evidence:** the unrounded values are WH 4.38 vs 4.45 and CGH 3.43 vs 3.41, so the arithmetic is right, but readers see equal numbers labelled better or worse.
- **Suggested fix:** use a "no change" band (for example, within ±2%) or show one more decimal.

### I-1 (Info) MOH values are rounded to 2 dp with round-half-even

307 of 12,061 daily wait values differ from the raw cell by exactly 0.005, all of them tie cases (for example AH 2023-01-06 raw 2.825 → 2.82; AH 2023-06-10 raw 0.995 → 1.00). This is consistent with the dictionary ("stored to 2 decimal places"). Weekly means are computed from the rounded daily values. Max |difference| = 0.005.

### I-2 (Info) Woodlands publishes median waits of 0

Raw `Historical!J1090` (WH 2025-12-22) = 0 and `Historical!J1097` (WH 2025-12-29) = 0, published as 0.0 with no DQ flag. These are source values, not imputed, but a daily median bed wait of 0 is implausible. A WARN check would make that visible. CGH 2026-02-08..02-21 (weekly means 0.96 and 0.82 h, against about 9 h before) is flagged `unit.weekly_shift_10x`. The raw cells hold those values (for example `Historical!C1146` = 0.417).

### I-3 (Info) Gaps are gaps (see Appendix D)

Woodlands' 539 pre-2024-06-23 days are blank in raw, absent from the marts, drawn as a line starting on 23 Jun 2024 with the label "22 days missing" (for a 1 Jun–15 Jul 2024 view), and absent from CSV exports. No other MOH day is missing.

### I-4 (Info) The annual A&E source's freshness reflects metadata, not data coverage

`/data-quality` › Freshness: "MOH Hospital Admissions… Annual · 28 Oct 2026 · Up to date". The CSV's latest year is 2023. The source is used only to reconcile (2023: 868,644 daily-sum vs 1,050,400 annual, −17.3%, reproduced).

### I-5 (Info) A small detector difference in the 4th decimal

NUH weekday Tuesday mean: auditor 7.9142, mart 7.9135. SGH weekly mean: 5.7545 vs 5.7544. NUH Spearman: 0.3931 vs 0.3932. All of these are tie-rounding effects below display precision. Nothing displayed changes.

### I-6 (Info) Some case-study claims can't be checked from this snapshot

The comprehension test ("Four AI agents… All four correctly named the top finding") and C1 ("collected every 3 hours into a separate store") cannot be verified from the snapshot or site. They are presented as simulated testing and internal status, not as outcomes. See Appendix E.

---

## Appendix A: 20 randomly drawn displayed numbers, traced to raw

Raw MOH files: bed waits = `moh_bed_waits/2026-11-06/cc679084d5c5dead6ef8bf2f89d7de224ff6894f89f8b1fa0aec09894535e3e2.xlsx`; attendances = `moh_ed_attendances/2026-11-06/15f6ef550b5b0d72e0c5389d616fac1272401c33632e3f21292a4bb07a45e017.xlsx`. In both, sheet `Historical` row 4 = 2023-01-01 and row 1396 = 2026-10-24; sheet `Sheet1` rows 4–10 = 2026-10-25..10-31. Columns B..J = AH, CGH, KTPH, NTFGH, NUH(A), SGH, SKH, TTSH, WH. SingStat = `singstat_residents/2026-11-06/09641d04b86723637867da4c89dd1a79cb9971d8db409e65986632e5e8484610.bin` › `respopagesextod2026.csv` (line numbers include the header). CHAS = `datagov_chas/2026-11-06/d25ed5c5b460d2c12a725a18670968478501d8fcf5bf34f1449f2f2ed1355e0e.geojson`. Boundaries = `datagov_planning_areas/2026-11-06/e6ecc1743de5c39ec154a30b3b8037896fbc6c5f863e10c7dbfd77de12706c9c.geojson`. NUHS = `nuhs_live/2026-11-08/08dcdda582b911be6b44fbeca73c8fe573aa1cdc4d9058ada710d8c1f9f02dc6.html`.

| # | Page | Shown text | What it is / mart row | Raw file + cell | Recomputed (method) | Result |
|---|---|---|---|---|---|---|
| 1 | `/` | anomaly chart "28 Sep: 1.5" | AH weekly average of daily median bed waits, ISO 2026-W40; `fct_ed_weekly` AH 2026/40 = 1.52 (7 days) | bed waits `Historical!B1370:B1376` | mean(1.82, 1.33, 1.48, 1.58, 1.62, 1.28, 1.53) = 1.5200 → 1.5 | Match |
| 2 | `/` | weekday chart "Fri: 8.0" | SKH Friday mean of daily medians, 2026-04-27..10-25; `fct_insight` weekday-d23b1bdd86 point fri = 8.0254 | bed waits `Historical!H1220`…`H1395`, 26 Friday rows | mean of 26 values = 8.0254 → 8.0 | Match |
| 3 | `/ed-trends` | slope chart "12.0 h NUH" | NUHS NUH Adult estimated bed wait; `fct_live_ed_snapshot` NUH Adult 2026-11-08 22:00:44 = 12.0 | NUHS html, table "Adult Emergency", row "Estimated Bed Wait Time", column NUH: "12 hour(s)" | 12 | Match |
| 4 | `/ed-trends` | heatmap SKH Sun "−50%" (data-value −49.52) | SKH Sunday mean / weekly mean − 1 | bed waits col H, 26 Sunday rows 2026-05-03..10-25 | 4.4862 / 8.8864 − 1 = −49.52% → −50% | Match |
| 5 | `/ed-trends` | slope chart "6.0 h NTFGH" | NUHS NTFGH Adult bed wait = 6.0 | NUHS html, Adult › Estimated Bed Wait Time › NTFGH: "6 hour(s)" | 6 | Match |
| 6 | `/ed-trends?mode=raw` | "CGH 3.4 hours vs 3.4 usual" | `fct_ed_weekly` CGH 2026-W43 = 3.4314; usual = median of W35–W42 weekly means | bed waits `Historical!C1391:C1396` + `Sheet1!C4` | mean(3.88, 6.28, 5.58, 4.88, 1.39, 0.68, 1.33) = 3.431 → 3.4; usual median = 3.4086 → 3.4 | Match |
| 7 | `/access-map` | legend "0.00 – 0.89 per 1,000 aged 65+ (7 areas)" | upper bound of the lowest quintile among 32 ranked areas = Sembawang `cdmp_clinics_per_1k_seniors` | SingStat Sembawang 65+ rows; CHAS: 13 CDMP features inside SW polygon | 7th lowest of 32: 13 / 14,570 × 1000 = 0.892 → 0.89 | Match |
| 8 | `/access-map` | "Newton: 1,670 residents aged 65+" | `fct_area_access` NT `residents_65plus` | SingStat lines 48546–50161 (576 rows, PA = Newton, AG 65_to_69 … 90_and_Over) | sum(Pop) = 1,670 | Match |
| 9 | `/access-map?view=table` | Bukit Timah "1.29" (CHAS per 1,000 aged 65+) | `fct_area_access` BT `clinics_per_1k_seniors` = 1.2947 | CHAS: 21 features whose X/Y lie in BT polygon; SingStat BT 65+ = 16,220 | 1000 × 21 / 16,220 = 1.2947 → 1.29 | Match |
| 10 | `/access-map?view=table` | Yishun CDMP clinics "55" | `fct_area_access` YS `cdmp_clinics` | CHAS: 55 features with `CLINIC_PROGRAMME_CODE` containing CDMP inside YS polygon | point-in-polygon count = 55 | Match |
| 11 | `/live` | NTFGH "Patients waiting to see a doctor 9" | `fct_live_ed_snapshot` NTFGH Adult `patients_waiting` = 9 | NUHS html, Adult › Number of Patients Waiting for Consult › NTFGH: "9 patient(s)" | 9 | Match |
| 12 | `/live` | NUH "Estimated wait for a ward bed 12 hours" | as #3 | as #3 | 12 | Match |
| 13 | `/data-quality` | "NTFGH, 2023-02-01: median_wait_hours = 24.3" | `fct_ed_daily` NTFGH 2023-02-01 = 24.3, dq_flags `range.bed_wait_over_24h` | bed waits `Historical!E35` = 24.3 | 24.3 | Match |
| 14 | `/data-quality` | "AH 2025-04-01: 112 vs mean 67 (SD 11)" (token: SD 11) | check `range.attendances_rolling_4sd` | attendances `Historical!B825` = 112; prior 56 days `B769:B824` | 56-day prior window: mean 67.0, SD 10.7 → 11. The window is inferred: its definition is in `data_quality.md`, which the auditor may not read | Match (window inferred) |
| 15 | `/summary` | Sengkang "37,280" residents aged 65+ | `fct_area_access` SK `residents_65plus` | SingStat lines 74994–76913 (672 rows) | sum = 37,280 | Match |
| 16 | `/summary` | Bedok "about 11" clinics short | geojson `cdmp_shortfall` BD = 11.17 | SingStat BD 65+ (lines 3858–6081) = 67,290; CHAS 74 CDMP in BD; national 1,048 / 828,010 | 67,290 × 1,048 / 828,010 − 74 = 11.17 → about 11 | Match |
| 17 | `/methodology` | "868,644 (2023)" all-site attendances | sum of `fct_ed_daily.attendances` for 2023 | attendances `Historical!B4:J368` | sum = 868,644 (WH blank in 2023) | Match |
| 18 | `/case-study` | "949,568 in 2025" | sum of 2025 attendances | attendances `Historical!B735:J1099` | sum = 949,568 | Match |
| 19 | `/case-study` | "About 40% of ED attendances were non-urgent (MOH, 8 Nov 2022)" | external citation; no mart | not in the snapshot | cannot be recomputed; externally sourced | External, not traced |
| 20 | `/glossary` | "One of the 55 areas URA divides Singapore into" | `fct_area_access` row count | boundaries geojson: 55 features; SingStat: 55 distinct PA | 55 | Match |

Cross-checks against CSV downloads (Appendix B, last row) found 0 mismatches.

---

## Appendix B: chart and figure checks

Units were checked against `data_dictionary.md`; as_of against `manifest.json` and the latest data dates (MOH 2026-10-31; CHAS 2024-06-06; SingStat 2026-06-30; NUHS 2026-11-08 22:00:44).

| Page / chart | Title, axis and unit labels | as_of / source shown | Verdict |
|---|---|---|---|
| `/` hero KPI 12.7 hours | "Average bed wait on Tuesdays", "vs 8.9 hours, its weekly average" | 25 Oct 2026, MOH, amber "2 weeks old" | Values match (12.6977, 8.8864). Label: L-1. Freshness: M-1 |
| `/` "Why now" 19.5% | "828,010 of 4,240,430 residents" | 30 Jun 2026, SingStat, "4 months old" | Match (828,010 / 4,240,430 = 19.53%) |
| `/` Finding 1 bar chart | "Time waiting for a ward bed after the decision to admit"; "Hours, average of the daily medians on that weekday"; reference "Weekly average: 8.9" | 25 Oct 2026, MOH | Bars 9.4/12.7/12.6/10.0/8.0/5.0/4.5 match. Kruskal-Wallis H = 89.51, ε² = 0.4945 (matches `effect_size`), p ≈ 4e-17 ("less than 1 in 1,000" holds) |
| `/` Finding 2 line chart | "Hours, average of each day's median"; "Usual level: 1.4" | 25 Oct 2026, MOH | 9 weekly points match to 4 dp. Median of 8 prior weeks 1.3736, MAD 0.145, robust z = 3.565 (matches 3.5652) |
| `/` Finding 3 bars | "Bed wait the day after, hours vs usual for that weekday"; x "Days in five equal groups by ED visits vs usual" | 25 Oct 2026, MOH | Spearman 0.3931 (shown 0.39), n = 181. Bars are group medians: L-2 |
| `/ed-trends` daily small multiples (relative) | "Each hospital's daily median, in hours above or below its own usual level, 3 Aug 2026 to 31 Oct 2026" | 31 Oct 2026, MOH, unit caveat present | All 9 "31 Oct: … vs usual" values recomputed: AH +0.08 (+0.1), CGH −2.26, KTPH −0.63, NTFGH −3.15, NUH −1.40, SGH −2.71, SKH −8.51, TTSH −0.50, WH −1.91. All match |
| `/ed-trends?mode=raw` daily small multiples | "Each hospital's daily median, hours … all on the same scale" | 31 Oct 2026 | Latest values match `Sheet1` row 10 (AH 1.45 → 1.5; CGH 1.15 → 1.2; KTPH 2.25 → 2.3; NTFGH 2.41 → 2.4; NUH 4.35 → 4.4; SGH 4.43 → 4.4; SKH 2.22 → 2.2; TTSH 3.53 → 3.5; WH 2.54 → 2.5) |
| `/ed-trends` latest week vs usual (dumbbell) | "% above or below the hospital's own usual level"; raw mode "Hours, average of each day's median" | 31 Oct 2026 | AH +56%, NTFGH −39%, SKH −36%, KTPH −17%, SGH +10%, TTSH −4%, NUH −3%, WH −2%, CGH +1%: all match. Arrows on equal rounded values: L-9 |
| `/ed-trends` weekday heatmap | "Each weekday's bed wait, % above or below the hospital's own average" | 31 Oct 2026 (the window ends 25 Oct; stated in the subtitle) | 63 cells spot-checked via the per-hospital means. Match |
| `/ed-trends` NUHS estimate and MOH figure (slope) | "MOH figure: daily median, 31 Oct" / "NUHS estimate: 8 Nov 2026, 10:00 pm SGT" | "Data as of 31 Oct 2026 · Source: NUHS, MOH" | H-1 (as_of); C-1 (AH "1.0 h" is "< 1 hour(s)") |
| `/access-map` 3D legend | "CDMP GP clinics per 1,000 residents aged 65+", 5 quantile classes, "(23 areas)" grey | 6 Jun 2024, data.gov.sg + SingStat, caveat on mixed dates | Class bounds and counts (7/6/7/6/6 = 32) match; 23 excluded areas match; tallest 67,290 (Bedok) matches |
| `/access-map` scatter "Many seniors, few clinics" | "Across: residents aged 65+. Up: CDMP GP clinics per 1,000"; median lines | 6 Jun 2024 | 32 dots and values match; median rate 1.1649 (axis tick 1.2); median 65+ = 25,265 |
| `/access-map` shortfall bars | "CDMP GP clinics the national rate would give… minus the clinics they have" | 6 Jun 2024 | 10 values match (Hougang 13.46, Bukit Panjang 13.06, Bedok 11.17, …). Jurong West sensitivity: M-4 |
| `/access-map?view=table` | column headers per dictionary; "% of land within 1 km of a CDMP clinic"; "Approx. distance to nearest polyclinic (km)" | 6 Jun 2024 | All 55 rows match the mart (rounded). "No data" wording: L-5 |
| `/live` cards | "Patients waiting to see a doctor", "Estimated wait to see a doctor", "Estimated wait for a ward bed (estimate)" | 8 Nov 2026, 10:00 pm SGT, NUHS | Matches the latest raw page except the 3 "< 1" cells: C-1 |
| `/data-quality` coverage grid and whole series | "9 hospitals by 91 days, 2026-08-02 to 2026-10-31: 819 … both figures, 0 missing" | 31 Oct 2026 | Recomputed: 9 × 91 = 819, 0 missing; whole-series expected days 1,400 / 861 (WH) match manifest `coverage_per_hospital` |
| `/data-quality` freshness table | 8 sources | matches manifest `sources.*.as_of` and `last_fetched_at` dates exactly | Match. Page badge: L-6 |
| `/data-quality` check counts | 77 checks, 0 blocking, 3 warnings, 1 set aside | 8 Nov 2026 | Matches `dq_results` run 223112; manifest says 75: M-3 |
| `/summary` | same KPIs and priority table | 30 Jun 2026; 25 Oct 2026; 6 Jun 2024 | Values match; M-1 applies |
| CSV `/export/areas.csv` | 55 rows | `data_as_of` 2024-06-06 | 0 mismatches vs mart / geojson (8 numeric columns + shortfall) |
| CSV `/export/ed-daily.csv` (two linked ranges: 1,638 + 810 rows) | | `data_as_of` 2026-10-31 | 0 mismatches vs `fct_ed_daily` |
| CSV `/export/ed-weekly.csv?weeks=10` | 90 rows, includes partial W44 with `days_reported_*` = 6 and `is_complete_week` = false | 2026-10-31 | 0 mismatches; partial week shown with day count (as the dictionary requires) |
| CSV `/export/findings.csv` | 28 rows | `data_as_of` 2026-10-25 on all rows | `metric_value` 0 mismatches; as_of/source: M-2 |

---

## Appendix C: independent recomputation of two marts

**Method.** `fct_ed_weekly` was rebuilt from `staging.stg_moh_bed_waits` and `stg_moh_ed_attendances`: Python `date.isocalendar()` grouping, mean of non-null waits, sum of non-null attendances, day counts, completeness = both counts 7, sorted distinct sha256 list, `max(fetched_at)`. Staging was first checked against raw: all 12,061 `fct_ed_daily` rows equal `round(raw, 2)`, or differ by an exact half-even tie ≤0.005. All 1,732 weekly rows were compared; **0 differences** at tolerance 1e-9. The two randomly drawn weeks are shown below.

`fct_area_access` was rebuilt from raw. SingStat: sum of `Pop`, 65+ = the six age groups. CHAS: Description HTML parsed; the feature's own SVY21 `X_COORDINATE`/`Y_COORDINATE` used. Boundaries: WGS84 polygons projected to SVY21 with the auditor's own Transverse Mercator implementation, validated against CHAS X/Y at a median 0.00004 m and maximum 0.00007 m. Point-in-polygon by ray casting; area by shoelace (holes subtracted); centroid by area-weighted ring centroids; nearest polyclinic by Euclidean SVY21 distance. Coverage within 1 km was estimated by rasterising each polygon on a 10 m grid (no shapely available) and testing each cell centre against all active CDMP clinics within 1 km. National rate = 1,048 / 828,010. All 55 areas were compared: **0 differences** on every column except `pct_area_within_1km_of_cdmp`, which matched within 0.1 point at 10 m (Mandai 0.08, Marina South 0.06, Straits View 0.08, Jurong West 0.01). At a 100 m grid the worst case was 1.37 points (Marina South), as expected for small areas. Total `area_km2` = 796.912 km² (mart 796.912); each area is within 0.001% of URA's own `SHAPE.AREA`.

### C.1 Weeks drawn: ISO 2024-W31 (2024-07-29..08-04) and 2025-W11 (2025-03-10..03-16)

Columns compared: `week_start`, `week_end`, `mean_of_daily_median_wait_hours`, `total_attendances`, `days_reported_wait`, `days_reported_attendances`, `is_complete_week`, `source_sha256`, `as_of`, `as_of_basis`. All rows have 7/7 days, `is_complete_week` true, `source_sha256` = `15f6ef55…,cc679084…` (both equal), `as_of` 2026-11-06 14:51:53 (both equal), basis `fetched`.

| Hospital | 2024-W31 mean wait: mart / auditor | Attendances: mart / auditor | 2025-W11 mean wait: mart / auditor | Attendances: mart / auditor |
|---|---|---|---|---|
| AH | 1.557142857142857 / 1.5571428571428572 | 451 / 451 | 1.2385714285714287 / same | 456 / 456 |
| CGH | 11.325714285714286 / same | 2665 / 2665 | 8.492857142857142 / 8.492857142857144 | 2539 / 2539 |
| KTPH | 3.87 / 3.87 | 1715 / 1715 | 2.357142857142857 / same | 1544 / 1544 |
| NTFGH | 3.0642857142857136 / 3.064285714285714 | 2292 / 2292 | 2.585714285714286 / same | 2346 / 2346 |
| NUH | 3.2514285714285713 / same | 2091 / 2091 | 4.569999999999999 / 4.57 | 1995 / 1995 |
| SGH | 4.805714285714286 / same | 2203 / 2203 | 2.2542857142857144 / 2.254285714285714 | 2265 / 2265 |
| SKH | 12.281428571428572 / same | 2397 / 2397 | 6.117142857142857 / same | 2575 / 2575 |
| TTSH | 5.647142857142858 / same | 2455 / 2455 | 4.695714285714286 / same | 2551 / 2551 |
| WH | 2.9 / 2.9 | 1118 / 1118 | 2.5171428571428573 / same | 1378 / 1378 |

The only differences are floating-point summation order (≤3e-15). Result: **match**.

### C.2 Areas drawn: Mandai (MD) and Orchard (OR)

| Column | MD mart | MD auditor | OR mart | OR auditor |
|---|---|---|---|---|
| planning_area / region_name | Mandai / NORTH REGION | MANDAI / NORTH REGION | Orchard / CENTRAL REGION | ORCHARD / CENTRAL REGION |
| population_year | 2026 | 2026 | 2026 | 2026 |
| residents_total | 1990 | 1990 | 1490 | 1490 |
| residents_65plus | 360 | 360 | 250 | 250 |
| chas_clinics | 0 | 0 | 21 | 21 |
| cdmp_clinics | 0 | 0 | 18 | 18 |
| clinics_per_1k_seniors | 0.0 | 0.0 | 84.0 | 84.0 |
| cdmp_clinics_per_1k_seniors | 0.0 | 0.0 | 72.0 | 72.0 |
| area_km2 | 11.767308133633 | 11.767308133634 | 0.957526223815 | 0.957526223815 |
| pct_area_within_1km_of_cdmp | 36.1387 | 36.216 (10 m grid, 117,680 cells) | 100.0 (99.99999999999994) | 100.0 (9,584 cells) |
| approx_km_centroid_to_nearest_polyclinic | 3.136913539023 | 3.136913539023 | 2.757183069168 | 2.757183069170 |
| nearest_polyclinic | Woodlands Polyclinic | Woodlands Polyclinic | Outram Polyclinic | Outram Polyclinic |
| centroid_in_area | true | true | true | true |
| dq_note | <1,000 aged 65+; no CDMP clinic inside | same rules apply (360 < 1,000; 0 CDMP) | <1,000 aged 65+ | same (250 < 1,000) |
| excluded_reason (geojson) | fewer than 1,000 residents aged 65+ | same | fewer than 1,000 residents aged 65+ | same |
| cdmp_shortfall (geojson) | null | null (excluded) | null | null (excluded) |
| clinics_as_of / population_as_of / as_of | 2024-06-06 14:36:42 / 2026-06-30 / 2024-06-06 14:36:42 (source_updated) | least(CHAS lastUpdatedAt, end-June) = same | same | same |
| lineage sha256 (clinic/pop/boundary/polyclinic) | d25ed5c5… / 09641d04… / e6ecc174… / 2e06015c… | the raw files used | same | same |

Tolerances: exact for counts, text and booleans; 1e-9 for ratios; 1e-4 km² for area; 1e-3 km for distance; 0.2 points for grid-estimated coverage. Result: **match**.

---

## Appendix D: gap and imputation checks

**MOH raw scan** (`parse_moh.py`): every data cell in both workbooks and both sheets was classified. Bed waits: 11,743 float + 318 int + 539 empty. Attendances: 12,061 int + 539 empty. No text or non-numeric cells, no duplicate dates, no extra columns. All 1,078 empty cells are Woodlands (column J), 2023-01-01..2024-06-22.

| Check | Evidence | Result |
|---|---|---|
| Empty raw cells not stored as 0 or filled | `fct_ed_daily` has 0 rows for WH before 2024-06-23 (first WH row 2024-06-23); 0 NULL waits and 0 NULL attendances in 12,061 rows; the only 0-valued waits (WH 2025-12-22, 2025-12-29) are 0 in raw (I-2) | Pass |
| No interpolation | 12,061 / 12,061 daily values equal round(raw, 2) | Pass |
| Weekly day counts and completeness | WH 2024-W25 (2024-06-17..23): `days_reported_wait` = 1, `days_reported_attendances` = 1, `is_complete_week` = false, mean = 3.0 (one day), total = 114 (one day). ISO 2022-W52 (2023-01-01 only): 1/1, false, for 8 sites. 2026-W44 (2026-10-26..11-01): 6/6, false, for all 9 | Pass (matches dictionary) |
| Daily `is_complete_week` | 0 mismatches vs auditor's 7-days-of-both rule over 12,061 rows | Pass |
| Site shows gaps | `/ed-trends?hospital=WH&hospital=AH&from=2024-06-01&to=2024-07-15&mode=raw`: WH polyline starts at x = 50 of 100 (day 23 of 45 = 23 Jun) with no points before; text "Woodlands Hospital: latest 3.3 hours, 22 days missing" and "Days with no figure in this range: WH 22" (1–22 Jun = 22 days) | Pass |
| CSV keeps gaps | `/export/ed-daily.csv?from=2024-06-15&to=2024-06-25&hospital=WH` first row is 2024-06-23 (no rows, and no zeros, for 15–22 Jun) | Pass |
| Default-window statement | `/ed-trends`: "Every day in this range has a figure for each hospital shown." Verified for 2026-08-03..10-31 (810 hospital-days, all present) | Pass |
| Partial-week totals | weekly CSV row AH 2026-10-26 total 473 with days 6/6, `is_complete_week` false; the site's "latest week" uses 19–25 Oct (complete) | Pass |

**Access side**

| Check | Evidence | Result |
|---|---|---|
| Ratios NULL where no seniors | 13 areas with `residents_65plus` = 0 have NULL in both ratio columns (mart), `null` in geojson, empty in CSV, "No data" in the table (wording: L-5) | Pass |
| Zero clinics as a real 0 | Mandai, Sungei Kadut, Tengah: 0 CHAS and 0 CDMP, ratios 0.00 (not NULL), dq_note "No CDMP clinic inside the area". River Valley: 1 CHAS, 0 CDMP → 0.00 | Pass |
| Excluded areas | 23 areas with <1,000 aged 65+ (the 13 with no seniors, plus 10 small ones: CH 290, DT 540, MD 360, MU 80, OR 250, SI 320, SK 180, SL 20, SR 420, WC 30) have `excluded_reason` and null `cdmp_shortfall`; `insights.json` `excluded_areas` = 23 | Pass |
| Quarantined clinic not imputed | 19M0103 (X = Y = 0) absent from `dim_clinic` (1,192 rows) and from all counts, not snapped to an area | Pass (impact: M-4) |
| Population missing | 55 / 55 areas present; none NULL | n/a |

---

## Appendix E: case study claims (`/case-study`)

No "TODO(me)" text appears on any page (searched every rendered page). There are no invented quotes. The one quoted sentence is attributed to the MOH "Getting medical help" page. Personas and the stakeholder map are labelled as assumptions ("No one has been interviewed"). Outcomes are explicitly "none claimed".

| # | Claim | Backing | Check |
|---|---|---|---|
| 1 | 21.4% of citizens aged 65+ in June 2026 | External (population.gov.sg; NTU 26 Sep 2026) | Not in snapshot (SingStat file is residents, not citizens); not contradicted |
| 2 | Residents 19.5%: 828,010 of 4,240,430 | Snapshot | Recomputed: 828,010 / 4,240,430 = 19.53% |
| 3 | 8 sites: 868,644 (2023), 863,988 (2024), 869,131 (2025) | Snapshot | Recomputed exactly (sum of AH–TTSH). "8 public EDs" includes AH UCC: L-8 |
| 4 | All-site 949,568 in 2025 includes WH, added June 2024 | Snapshot | Recomputed 949,568; WH first value 2024-06-23 |
| 5 | 2025 typical bed wait: 2.5 h (KTPH, NTFGH) to 6.2 h (CGH); 1.3 h AH; "typical = median of daily medians" | Snapshot | Recomputed 2025 medians: KTPH 2.53, NTFGH 2.50, CGH 6.23, AH 1.275 (→ 1.3); others NUH 4.72, SGH 3.92, SKH 4.81, TTSH 5.01, WH 2.91. Match |
| 6 | 32 areas ≥1,000 aged 65+; CDMP per 1,000 from 0 (River Valley, Tengah) to 5.02 (Rochor); median 1.16 | Snapshot | Recomputed: 32; min 0 (RV, TH); max 5.0167 (RC); median 1.1649. Match |
| 7 | Seniors: 828,010 residents aged 65+ | Snapshot | Match |
| 8 | MOH Nov 2022: median ward-bed wait averaged about seven hours; about 40% of attendances non-urgent | External (MOH, 8 Nov 2022) | Not checkable. Not contradicted: this snapshot starts 2023 |
| 9 | Clusters are regional health managers for about 1.5 million residents each; family doctor first point of contact; people with a regular family doctor have fewer ED visits | External (Healthier SG White Paper) | Not checked; presented as cited, not as a finding of this data |
| 10 | AIC is the National Care Integrator since 2018; Synapxe runs NEHR and HealthHub | External | Not checked |
| 11 | Quote "Go to the hospital's Emergency Department only if…" | External quote (MOH, Getting medical help) | Not fetched; attributed |
| 12 | 1777 hotline closes from 1 Jan 2027; NurseFirst 6262 6262 | External (MOH 1 Jul 2026) | Not checked |
| 13 | AH receives eligible non-life-threatening SCDF cases from Oct 2025; full ED from 2028 | External (NUHS 29 Sep 2025) | Not checked |
| 14 | Publication lag 8 days (31 Oct → 8 Nov 2026), target not met | Snapshot | Match (manifest MOH as_of 2026-10-31; snapshot 2026-11-08) |
| 15 | Blocking checks "0 of 77" | Snapshot / site | 0 blocking: match. 77 matches the site and `dq_results`; manifest says 75 (M-3) |
| 16 | ED coverage 100% for all 9 sites | Snapshot | Match |
| 17 | Provenance: all figures show as_of and source, "Met" | Site | Overstated: H-1 (and M-1 / M-2) |
| 18 | MoSCoW M2 "We never fill in missing values" | Site / data | True for MOH and access (Appendix D). Arguably breached for NUHS "< 1" (C-1: a bound shown as a value) |
| 19 | "Four AI agents … All four correctly named the top finding" | Cites a project doc (comprehension report) | Unbacked by the snapshot; labelled "simulated testing, not user research" (I-6) |
| 20 | C1 "collected every 3 hours into a separate store, not published" | Internal status | Unverifiable (I-6) |
| 21 | "What surprised": waits differ between hospitals, by weekday, and "at some hospitals they also move with the number of ED visits" | Snapshot findings | Supported (weekday ε² up to 0.49; Spearman 0.21–0.39). Associative wording |

**Causal wording.** No "causes", "drives" or "leads to" is applied to any finding on any page. Instances found:
- "how often GP referrals lead to ED visits": describes a question the data cannot answer, not a finding.
- "Each was published only because it passed a fixed statistical check" (`/`): about the publishing process.
- "We read the values as hours, because a typical value is about 4" (`/ed-trends`): about the unit.

The findings use "move with", "come with" and "is associated with".

---

## Appendix F: method, random draws and limits

**Random seed.** Every draw used a fresh `random.Random(20261108)`:
- **Weeks** (`weekly.py`): `rng.sample(sorted ISO weeks present, 2)` → **(2024, 31), (2025, 11)**.
- **Areas** (`access_cmp.py`): `rng.sample(sorted planning_area_codes, 2)` → **MD (Mandai), OR (Orchard)**.
- **Numbers** (`draw20.py`): every numeric token was extracted from the rendered text of 11 pages, excluding dates, times, years, hashes and code identifiers. Pool sizes: `/` 76, `/ed-trends` 129, `/ed-trends?mode=raw` 132, `/access-map` 265, `/access-map?view=table` 404, `/live` 11, `/data-quality` 166, `/summary` 32, `/methodology` 236, `/case-study` 115, `/glossary` 12. Allocation (stratified so every page with numbers gets at least one): 2, 3, 1, 2, 2, 2, 2, 2, 1, 2, 1 = 20. For each page in that order, the order of candidates is `rng.sample(range(n), n)`, and the first k that are data figures are taken. Rejected, in draw order:
  - UI counts, terms and constants: `/` "(1)" note count; `/access-map` "2" and "10" rank ordinals; `/summary` "5" rank and "24"-hour; `/methodology` "1,000" threshold and "12" word limit; `/case-study` "2" (ID C2), "24"-hour, "0003", "0005", "24", "24"; `/glossary` "65", "8", "1,000", "1", "1,000", "65".
  - Accepted, in order: `/` 57, 28; `/ed-trends` 126, 84, 124; raw 40; access-map 20, 147; table 62, 395; live 5, 9; data-quality 101, 45; summary 15, 25; methodology 13; case-study 14, 31; glossary 10.
  - All five categories are covered: ED (#1–6, 13, 14, 17, 18), access (#7, 9, 10, 16), population (#8, 15, 20), live (#3, 5, 11, 12) and findings (#1, 2, 16).

**Other recomputations.** `findings.py` and `kw.py` cover all 9 weekday findings, the pooled ratio, the AH anomaly and 8 Spearman correlations (they reproduce the 15 published ED findings to the displayed precision) and the volume-vs-wait chart. `access_cmp.py` covers all 10 access-gap shortfalls. Methodology figures also checked: 332 subzones, 90 with no residents, 56 inhabited with <500 aged 65+; "Others" dwelling 35,280 residents / 20,410 aged 65+; 63 days with a median wait over 24 h; reconciliation −17.3%.

**Limits of this audit**
- **No geospatial library.** Coverage within 1 km was estimated on a 10 m raster (expected error ≈0.1 point; ~1 point for sub-km² areas at 100 m), not by exact buffer union. Simplified map geometry (5 m tolerance, gaps and overlaps) was not validated; only properties were. Geodesic-area claims (0.0013% / 0.002%) were not tested. Areas were checked against URA's `SHAPE.AREA` instead (≤0.001%).
- **Statistical p-values** were not recomputed except Kruskal-Wallis for three hospitals (closed-form χ² with 6 degrees of freedom). Benjamini-Hochberg adjustment across the 46 tests was not reproduced. Spearman p-values were not computed (no scipy).
- **The rolling-4SD window** in #14 was inferred (56 days prior); its definition is in `data_quality.md`, which the auditor may not read.
- **The 2D and 3D maps** (Leaflet and WebGL) were not inspected visually. Their data source (`planning_area_access*.geojson`) and the table view were checked instead. Chart polylines were checked for gaps and point counts, not pixel-to-value mapping.
- **External citations** (Appendix E) were not fetched. The MP2019 comparison ("Changi Bay 83%…") cannot be checked: no MP2019 file is in the raw zone. The quarantined clinic's area (M-4) was not geocoded.
- **Auto-loaded context.** At one point the Claude Code environment automatically loaded the project's `CLAUDE.md` into the auditor's context; it was not requested. It holds general principles and commands, no data or implementation logic. No finding relies on it, and every figure here was recomputed from the inputs listed above.

---

## Resolution (added after the audit)

*This section was written by the project, not the auditor. The findings above are left as found.*
Fixes are in the code from the commits named; the live site shows the data fixes once a new weekly
data release is published.

| Finding | Status | What changed | Commit |
|---|---|---|---|
| C-1 | Fixed | "< 1 hour(s)" kept as a bound with a `<` qualifier; shown as "Under 1 hour"; left out of comparisons; WARN check `live.bounded_estimate` | `6f5389b` |
| H-1 | Fixed | Charts mixing sources show each source's own date and badge | `20e3d9a` |
| M-1 | Fixed | Findings dated and badged by their sources; their window stated as "This finding uses data to …" | `20e3d9a` |
| M-2 | Fixed | Each finding carries `source_ids`; the findings CSV dates and credits each row by them | `20e3d9a` |
| M-3 | Fixed | Manifest check counts read from the published run, after the insight engine | `2d20cd4` |
| M-4 | Fixed | Access caveats name set-aside CDMP clinics with postcode and reason; the area is not guessed | `3780622` |
| M-5 | Fixed | Data dictionary defines the mart `as_of` (download time) and the displayed "Data as of" (source's latest date) | `be946a3` |
| L-1, L-2, L-8 | Fixed | "Average of daily median bed waits"; "Median bed wait" on the volume chart; Alexandra's UCC called a UCC | `2416f62` |
| L-7 | Fixed | Each finding's warnings are only those on its own tables (`dq_tables`) | `2416f62`, `8e82014` |
| L-3, L-4, L-5, L-6, L-9 | Fixed | Weekday table lists only chosen hospitals; loading skeleton matches; "n/a (no residents)"; release-date label without badge; equal-as-shown reads "about the same" | `8e82014` |
| I-2 | Fixed | WARN check `range.bed_wait_zero` flags daily medians of 0, kept as published | `2416f62` |
| I-4 | Fixed | The yearly A&E source's basis says it is not the latest year covered | `8e82014` |
| I-1, I-3, I-5 | No change needed | Consistent with the documented rounding and gap handling | |
| I-6 | No change needed | The case study presents these as simulated testing and internal status, not outcomes | |

Not changed: the map legend still groups areas with no residents aged 65+ under "No data" (the
table, area panel and map labels say "n/a (no residents)").
