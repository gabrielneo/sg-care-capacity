# Methodology

How the figures on this site are sourced, checked, transformed and computed, and what they can't tell
you. Every column is defined in the [data dictionary](data_dictionary.md); every data-quality check
is described in [the data-quality checks](data_quality.md); the decisions behind the design are in
the [architecture decision records](adr/README.md).

## Sources

All sources are public and aggregate: counts and statistics about hospitals, clinics, places and
populations. **No personal or patient-level data is collected.**

| Source | Publisher | What it gives | How often it changes | How it is collected |
|---|---|---|---|---|
| Waiting Time for Admission to Ward | MOH | Daily median wait for a ward bed, per public ED, from 1 Jan 2023 | Weekly (files end on a Saturday) | Weekly workbook (.xlsx) from MOH's website |
| Attendances at Emergency Medicine Departments | MOH | Daily attendances, per public ED, from 1 Jan 2023 | Weekly | Weekly workbook (.xlsx) from MOH's website |
| ED waiting time page | NUHS | Estimated waits and patients waiting at AH, NUH (adult and children's) and NTFGH, at one moment | Continuously (estimates) | The page is read when each weekly snapshot is built |
| CHAS Clinics | data.gov.sg (MOH) | Location and programmes (CHAS, CDMP) of every CHAS GP clinic | Irregular: last updated 6 Jun 2024 | data.gov.sg API |
| Master Plan 2025 Planning Area Boundary (No Sea) | data.gov.sg (URA) | The 55 planning-area polygons | With each Master Plan | data.gov.sg API |
| Cervical Screening Centres | data.gov.sg (HPB) | Used as the **polyclinic list** (it includes all 26 polyclinics) | Irregular | data.gov.sg API |
| Residents by Planning Area / Subzone, Age Group, Sex and Type of Dwelling | SingStat | Residents and residents aged 65+, per planning area and subzone, at end-June | Yearly (published around September) | Downloaded by hand once a year and committed; SingStat refuses automated requests from GitHub's servers |
| Singapore Public Holidays (consolidated) | data.gov.sg (MOM) | Dates and names of public holidays, 2020–2027; marks time-series charts only | Yearly | data.gov.sg API |
| Hospital Admissions and Public Sector Outpatient Attendances | data.gov.sg (MOH) | Annual A&E attendances, used **only** to cross-check the daily MOH series | Yearly | data.gov.sg API |

Every figure on the site shows the date its data was current (`as_of`) and its source. The Data
Quality page shows each source's current date and how fresh it is for how often it changes.

## Licences and attribution

This is an independent, non-commercial project. It is not affiliated with or endorsed by MOH, NUHS,
SingStat, SLA or any other agency, and nothing on it is official.

**Singapore Open Data Licence.** The datasets below are used under its terms. Each is downloaded
again with every weekly data release, so its access date is the latest download, shown on the Data
Quality page; every past download is listed in `fetch_log.json`.

- Contains information from CHAS Clinics; Master Plan 2025 Planning Area Boundary (No Sea); Cervical
  Screening Centres; Singapore Public Holidays; and Hospital Admissions and Public Sector Outpatient
  Attendances, accessed on the date shown under "Last downloaded" on the [Data Quality](https://sg-care-capacity-web.vercel.app/data-quality) page, from data.gov.sg, which is made available under the terms of the
  [Singapore Open Data Licence version 1.0](https://data.gov.sg/open-data-licence).
- Contains information from Waiting Time for Admission to Ward and Attendances at Emergency Medicine
  Departments, accessed on the date shown under "Last downloaded" on the [Data Quality](https://sg-care-capacity-web.vercel.app/data-quality) page, from the Ministry of Health's website, which is made available under the terms
  of the [Singapore Open Data Licence version 1.0](https://data.gov.sg/open-data-licence).
- Contains information from Residents by Planning Area / Subzone, Age Group, Sex and Type of Dwelling,
  accessed on the date shown under "Last downloaded" on the [Data Quality](https://sg-care-capacity-web.vercel.app/data-quality) page, from the Department of Statistics Singapore (SingStat), which is made available under the
  terms of the [Singapore Open Data Licence version 1.0](https://data.gov.sg/open-data-licence).
- Contains information from OneMap's search service (the hospital map pins), accessed on the date
  in the "Hospital locations" line on the [Find a clinic](https://sg-care-capacity-web.vercel.app/find) page, from the Singapore Land Authority (SLA), which is made available under the terms of the
  [Singapore Open Data Licence version 1.0](https://data.gov.sg/open-data-licence).

**Other sources.**

- **NUHS:** the waiting estimates are figures read from NUHS's public ED waiting time page. The page
  itself is not copied onto this site or into its data releases.
- **OneMap:** the base map is OneMap's, © Singapore Land Authority, and shows OneMap's own attribution.

Clinic names are published by MOH as business names; some include a doctor's name. The site holds no
other information about any person.

The raw files downloaded from these sources are kept privately, not re-published: some sources' terms
don't allow it. You can check any of them against its source instead (next section).

Pages on Singapore government, university and public-healthcare websites are cited by name and date
rather than linked, because their terms ask for permission before linking. The only such links kept
are the licence page and the map credit, which the licences ask for. Every data file's full address
is in `fetch_log.json`.

## Verify a figure

Every data release (`data-YYYY-MM-DD` on GitHub) lets you check a figure without trusting this site.

1. **Find the file.** Every row in the data has a `source_url` and a `source_sha256`. That pair is also
   in `fetch_log.json` with when it was downloaded. The SHA-256 is a fingerprint: any change to a
   file changes it. (Three small reference tables, the hospital list, the measure definitions and the
   event dates, are built from this project's own published code instead; their fingerprint is of
   that code.)
2. **Download it from the source yourself and compare.** For example, MOH's bed-wait workbook for
   week 44 of 2026 was downloaded on 16 Nov 2026:

   ```bash
   curl -sL -o wt.xlsx "https://isomer-user-content.by.gov.sg/3/c0b55002-fd32-4451-9456-3beb7ea1bed1/WT%20for%20Admission%20to%20Ward_week44Y2026.xlsx"
   shasum -a 256 wt.xlsx
   # b5fe18be6a50505ced2211a32bd79f05efdc189495028022f89498dd2fcfb8fc  (as in fetch_log.json)
   ```

   If the source has since replaced or removed the file, use the Wayback Machine copy listed under
   `archive_captures` in `fetch_log.json`. The Internet Archive made that copy itself, a few seconds
   after this site's download, so it doesn't depend on this site. The NUHS page changes all the time,
   so its copy can show slightly different figures.
3. **Check the release wasn't edited.** Each file in a release is signed by the GitHub workflow that
   built it:

   ```bash
   gh attestation verify fct_ed_daily.parquet -R gabrielneo/sg-care-capacity
   ```

   This shows the workflow and the commit that built it. A file edited by hand fails the check.
   `manifest.json` also lists the SHA-256 of every file in the release.

Releases up to `data-2026-11-22` have no `fetch_log.json` and no signatures. Their rows still carry
`source_url` and `source_sha256`.

## From download to published figure

1. **Raw landing zone.** Every downloaded file is stored unchanged under `data/raw/<source>/<date>/`,
   named by its SHA-256, and logged in an append-only `manifest.jsonl`. Nothing in it is ever edited.
   Every table can be rebuilt from it offline (`sg-health reparse`), and the same files always give
   the same rows.
2. **Parse and gate.** Each file is parsed, then checked before any row is stored. A row that fails
   an error-level check goes to a `quarantine_<table>` table with its reason; it is never corrected.
   A file that fails a file-level check is rejected whole ([ADR 0002](adr/0002-validation-gate.md)).
3. **Clean tables with lineage.** Every stored row keeps `source_url`, `source_sha256` and
   `ingested_at`, so any figure can be traced to the exact file it came from.
4. **Validate.** Checks across whole tables: completeness, freshness, unit plausibility,
   reconciliation with other sources. A failed error-level check here **blocks publishing**.
5. **Transform.** Plain SQL builds typed staging views, then the marts the site reads. Every model's
   row counts are reconciled; a row lost without a logged reason stops the build. Geospatial measures
   are computed in Python, in SVY21 ([ADR 0003](adr/0003-svy21-for-distances-and-areas.md)).
6. **Publish.** Only if nothing blocks: a read-only snapshot with a manifest of hashes, row counts,
   dates per source and check results, released as `data-YYYY-MM-DD`
   ([ADR 0001](adr/0001-published-snapshot.md)).
7. **Serve.** The API verifies the snapshot before it starts, and returns every figure with its
   `as_of`, sources, caveats and data-quality warnings
   ([ADR 0005](adr/0005-typed-api-contract.md)).

This runs every Sunday on GitHub Actions. The [runbook](runbook.md) covers releases and rollback.

## Emergency department measures

**Median wait for a ward bed (daily).** MOH's definition: the daily median (50th percentile) time
from *"Decision by doctor to admit patient"* to *"Time patient exits EMD"* to go to a ward.

- It covers **only patients admitted that day**. Patients treated and sent home are not in it.
- **The unit is inferred, not stated**: neither MOH's workbook nor its page names it. Values are read
  as hours because the typical median is about 4 (minutes would mean 4-minute waits). A check warns if
  a week's values shift tenfold, the signature of a unit change.
- MOH publishes **daily medians only**. A weekly figure on this site is the **average of the daily
  medians**, not a weekly median, which can't be derived from them.

**Attendances (daily).** Patients who presented at the emergency department that day, *"regardless
of urgency of medical conditions"* (MOH). It measures demand, not acuity: it includes non-urgent cases.

**Which sites, and what they cover.**

- 9 sites: SGH, CGH, SKH (SingHealth); TTSH, KTPH, WH (NHG Health); NUH, NTFGH, AH (NUHS).
- **Alexandra Hospital is an Urgent Care Centre**, not a full ED. It is labelled wherever it appears
  and should not be ranked against EDs.
- **NUH figures cover its adult ED only.**
- **Woodlands Hospital is reported from 23 Jun 2024.** Totals across all sites jump when it joins:
  all-site attendances went from 868,644 (2023) to 949,568 (2025), but **without Woodlands they
  were flat** (868,644 in 2023, 863,988 in 2024, 869,131 in 2025). Compare like with like.
- MOH leaves KK Women's and Children's Hospital and NUH Children's Emergency out of these statistics.
  That is why the daily total is about 17% below MOH's annual A&E figure, which includes them
  (checked by `reconcile.annual_ae`).

**Complete weeks.** A week counts as complete when all 7 days of both measures are in. MOH's files
end on a Saturday, so the newest ISO week (Monday to Sunday) is usually 6 of 7 days. The Overview
compares only complete weeks.

**Average of daily medians, and whether to weight it by visits (checked 25 Nov 2026).** MOH publishes only daily medians, so a
weekly figure averages seven medians. That understates the days when waits ran longest and says nothing about the longest waits; the site
says so beside each bed-wait chart. A version weighted by each day's visits was compared on 1,523 complete hospital-weeks
(7 days of both measures; Alexandra's urgent care centre left out). It is slightly higher (0.04 to 0.20 hours on average by
hospital) and differs from the plain average by 1.9% on average, and by 5% or less in 95% of weeks (largest 13.6%, one
KTPH week). The plain average is kept: the difference is small, the plain average can be rebuilt by anyone from MOH's file, and
a visit-weighted average of medians is still not a median of waits.

**Year-on-year change and normal variation.** A month's change against the same month a year earlier is shown with the typical
size of such a change in the same series (the middle absolute change across the months that have one: about 25% in the data
release of 24 Nov 2026), so a change of 6% reads as inside the usual swing between years. This is a comparison with the
series' own history, not a significance test.

**Month by month and year on year.** The Month by month page and each hospital's page show the average bed wait and the ED
visits for each calendar month. A month's wait is the average of its daily medians (not a monthly median), and a month counts
only when every day of both measures is in; a partial month is a gap, never a figure. Each month is also set against the same
month a year earlier, and against the month before, but only when both months are complete. A missing change is shown as missing,
never 0%. Bed waits run longest in May and shortest in August, so the same month a year earlier is the fair comparison.

- **The average across hospitals** uses the 7 full EDs that MOH reported throughout. Alexandra Hospital (an urgent care centre) and
  Woodlands Hospital (reported from 23 Jun 2024) are left out, so the line does not step when a site joins. Every hospital counts
  equally, whatever its size; a month has a figure only when all 7 are complete.
- **The year so far** adds each year's months up to the newest complete month, counting only the months complete in every year
  shown, so two years are always compared over the same months. The average is of the monthly averages.
- **What it can't say.** A change from one year to the next describes the data; it is not tested, and it does not show why. The
  findings on the Findings page are the tested ones.
- **It follows the data.** These pages, their figures and the sentence at the top are read from the latest data release every
  time, so they change when the data does. Figures typed into the docs are checked against the data by a test that fails when they drift.

**NUHS estimates are a different measure.** NUHS's page shows its own *estimates* at one moment
(patients waiting, estimated wait to see a doctor, estimated wait for a bed). They are not MOH's
daily median of admitted patients and are only ever shown side by side with it, labelled as estimates.
On this site they come from the weekly snapshot, so they can be up to 7 days old.

**Comparisons on ED Trends.** Each hospital is compared with itself first, because hospitals differ in
size, case mix and how they work. Raw values across hospitals are a second view. The definitions
match the insight engine's, so a chart and its finding agree ([insights_method.md](insights_method.md)):

- **Usual level:** the median of the 8 complete weeks before the latest complete week. Each week is
  the average of its daily medians. All 8 weeks must be complete; otherwise the hospital has no usual
  level, and the charts say so rather than guess.
- **Latest week against usual:** the latest complete week as hours, or as a % of the usual level.
- **Status badges and unusual-week findings** (rule changed 25 Nov 2026). A week is marked only when it is far outside what that
  hospital's own previous 26 complete weeks look like: a robust z-score (the distance from the hospital's median, in units of
  1.4826 x the median absolute deviation, so a few odd weeks do not widen it) of 2.5 or more is "higher", 4 or more "much higher",
  and -2.5 or less "lower". The "usual" hours shown are still the median of the 8 weeks before the latest. Simulated over every past
  week of the data (173 weeks per hospital, 96 for Woodlands), the old rule (15% and outside the 8 weeks before) marked a hospital
  higher in 13% of weeks and lower in 11%; the new rule marks about 5% higher (1.5% much higher) and 1% lower. Waits are
  right-skewed, so "lower" rarely triggers. A hospital needs at least 20 of the 26 weeks and some spread; with fewer, the old rule
  applies (a documented shortcut). The table gives each hospital's usual week-to-week swing in hours, so "about usual" is not read
  as "steady": the same % change can be ordinary at one hospital and rare at another. The chart of the latest week against usual
  uses the same words as the badge.
- **Weekday pattern:** each weekday's average of daily medians, as a % above or below the hospital's
  own average. It uses the complete weeks among the 26 up to the latest complete week. A hospital
  with fewer than 4 complete weeks there is not shown.
- **All-hospital band:** each day, the middle half (25th to 75th percentile, linear interpolation)
  of the full EDs' values, with their median. Alexandra Hospital's urgent care centre is left out.
  A day with fewer than 3 hospitals reporting has no band.
- **Raw values across hospitals** carry two caveats, pinned on the chart: Alexandra Hospital's urgent
  care centre (shorter waits by design), and NUH (adults only).

**How sure each finding is.** Every finding on the site says how strong its evidence is, in one of
four levels. *Observed* means no statistical test was run. *Tested* means it passed one, after
correcting for every test in the run. *Robust* means it was tested and its 95% range excludes no
difference. *Association only* means a correlation that passed its test but says nothing about why.
Only tested findings mention chance. Each finding also states its *n*: how many days, weeks or
residents it rests on. Where the method allows, it gives a 95% range. A trend uses the Theil-Sen
interval. The weekday peak, the visits-and-waits correlation and the NUHS gap use a bootstrap.
It resamples the data 2,000 times, with a fixed seed, so every run gives the same range. Details are in
[how findings are tested](insights_method.md).

## Clinic access: what is measured

For each of Singapore's 55 planning areas (URA Master Plan 2025):

| Measure | What it says | What it doesn't say |
|---|---|---|
| **CDMP clinics per 1,000 residents aged 65+** (lead) | How many chronic-care GP clinics are located in the area relative to its older residents | Whether residents use them, can get appointments, or can reach them |
| CHAS clinics per 1,000 residents aged 65+ | The same for all subsidised GP clinics | |
| % of the area within 1 km of a CDMP clinic | How much of the area's land is close to one | How many *people* are close to one |
| Approx. distance from the area centre to the nearest polyclinic | Roughly how far the area is from public primary care | How far any particular resident is, or how long it takes to get there |

Inputs: CHAS clinic locations (data.gov.sg, June 2024), SingStat residents by planning area and age
(June 2026), URA Master Plan 2025 planning-area boundaries, and HPB's cervical screening centre list as
the polyclinic list (all 26 polyclinics, January 2026).

### Scope of the lead measure, small areas and daytime effects (added 25 Nov 2026)

- **CDMP GP clinics only.** The ratio counts clinics in the Chronic Disease Management Programme. The 26 polyclinics are
  not in it (they are used only for the distance measure), so the ratio is not total chronic-care capacity. The site says so
  beside every clinic chart and table.
- **Two dates.** The clinic list is from June 2024 and the resident counts from June 2026. Both dates are shown under the
  chart (read from each source's own date), not only in the notes.
- **Small areas stay ranked, with a note.** An area needs at least 1,000 residents aged 65+ to be ranked. Between 1,000 and
  2,999, the area is ranked but carries a note: one clinic more or fewer moves its rate by 0.33 or more per 1,000
  seniors, against a median of 1.16. Sensitivity of the ranked set (data release `data-2026-11-09`):

  | Minimum 65+ residents | Areas ranked | Median per 1,000 | Range | Areas at 0 |
  |---|---|---|---|---|
  | 1,000 (used) | 32 | 1.16 | 0 to 5.02 | River Valley, Tengah |
  | 2,000 | 30 | 1.16 | 0 to 5.02 | Tengah |
  | 3,000 | 28 | 1.16 | 0.73 to 2.80 | none |

  The median does not move. Only the two ends do: both zeros and the highest rate (Rochor, 2,990 seniors) come from areas
  under 3,000 seniors. Read the ends of the range with that in mind.
- **Daytime and commuter effect.** An area whose clinics are more than twice the island-wide clinics per resident
  (Rochor and Outram in this release) is noted: offices and hospitals draw people who live elsewhere, so a residents-only
  ratio overstates access for the people who live there. The 2x line is a judgement, not a tested threshold.
- **The benchmark rate** is the CDMP clinics divided by the residents aged 65+ of the ranked areas (1.18 per 1,000 in
  this release). The finding sentences state it.
- **Colour direction.** Darker means fewer clinics, on every map. A plain legend says so, and the two lowest and two highest
  areas are named beside the map. The alternative (darker means more) would suit a "capacity" map, but this project's question
  is where access is scarce, and the eye should go to scarcity first. It is a design choice, tested with the legend text rather
  than colour alone.
- **What clinic counts leave out:** opening hours, number of doctors, cost and transport.

### How the judgement thresholds were checked (25 Nov 2026)

These are choices, not tested limits. Each was run against the real history to see how much it matters.

- **The z-score line (2.5).** Share of hospital-weeks marked "higher" / "lower", over every past week with 26 weeks of history:
  2.0 marks 9.5% / 2.5% (at least one hospital in 43% of weeks); 2.5 marks 5.3% / 1.1% (28% of weeks); 3.0 marks 3.3% / 0.6% (21%).
  2.5 was kept: a week flagged about 1 hospital-week in 19, and some hospital in about 3 weeks in 10. At 2.0 the badge would fire
  about as often as the rule it replaced.
- **"Much higher" (4).** About 1.5% of hospital-weeks. A rarer mark for a rare week; there is no tested reason for 4 over 3.5.
- **The headline bar (0.30) and the relevance weights (0.6 for one hospital's weekday pattern, a further 0.8 for adults-only
  figures).** Re-run on the engine's inputs with data to 31 Oct 2026: the top finding moves from NUH's weekday pattern to the
  all-hospital weekday pattern (a system-wide finding), and two findings are headlines. With the bar at 0.2 a third is added
  (an access gap); at 0.4 or 0.5 only the all-hospital weekday pattern is left. The bar mainly decides how many headlines
  show; the weights decide which one leads.
- **Freshness limits (21 and 35 days).** The 8 data releases of 6 to 24 Nov 2026 were made 6 to 11 days after the last day of MOH
  data they hold (4 distinct data weeks). With new data about weekly, the newest data is at most about 17 days old just before the
  next arrives; 21 days is that plus a margin, 35 is five weeks. Eight releases over three weeks is a short record: re-check
  when more exist. (An earlier version of this note said 13 to 16 days, from two raw MOH bed-wait files; the release dates above
  are the better measure of what the badge sees.)
- **Daytime areas (2x the island-wide clinics per resident).** Flags Rochor and Outram in the data to 31 Oct. Novena (a hospital
  district) is just under the line. A different multiple would add or drop areas near it.

## Why a choropleth, not a heatmap

**Population is areal data.** SingStat publishes resident counts *per planning area and subzone*, not
the location of each resident. The count belongs to the whole area; nothing in the data says where
inside it people live.

- A **choropleth** shades each area by its value. It shows exactly what the data contains: one number
  per area, with the boundary it applies to.
- A **heatmap** (kernel density) spreads values smoothly across space. Applied to areal counts, it would
  have to invent where within each area residents live, and draw hot spots that the data never
  contained. That is fabrication, which the project's data principles rule out.

Clinics *are* point data, so on the map they belong as **points** (or circles) over the choropleth, not
blurred into a density surface either.

Two more rules for the choropleth:

- **Shade a rate, not a count.** Larger areas naturally have more clinics and more residents; shading
  counts would mostly show area size. The lead measure is per 1,000 residents aged 65+.
- **Show "no data" as its own style**, not the lowest colour. 13 planning areas have no residents
  (water catchments, Tuas, some islands), so their ratio is NULL and must look different from a low
  ratio.

**The 3D view** ([decision record 0006](adr/0006-3d-access-map.md)) adds one thing to the shading:

- **Height:** each area is raised by its residents aged 65+, one step per 10,000. Colour stays a rate.
- **Colour:** CDMP clinics per 1,000 seniors, in five groups with equal numbers of areas; darker means
  fewer.
- **Flat and grey:** areas with fewer than 1,000 seniors, which the findings don't rank either.
- **Same areas, no projection:** the shapes are the same simplified areas in SVY21 metres, so the
  browser projects nothing. They are still whole areas, not points or a density surface: nothing is
  placed where the data doesn't say.
- **On every map, darker means worse access:** fewer clinics per senior, less land near a CDMP clinic,
  or a longer distance to a polyclinic.

## Why SVY21 (EPSG:3414)

Distances and areas are only meaningful in a **projected** coordinate system measured in metres.
Raw longitude/latitude (WGS84, EPSG:4326) are angles: one degree of longitude is about 111 km at the
equator and shrinks with latitude, so "distance" in degrees is not a distance at all.

**SVY21 / Singapore TM** is Singapore's national projected grid, designed for the island:

- units are metres;
- distortion over Singapore's extent is negligible. Measured on the real data, SVY21 areas match
  geodesic (ellipsoidal) areas within **0.0013%** for every planning area, and test distances
  (39 km, 20 km, 1.6 km, 1 km) are within 1% of independently computed geodesic distances;
- it is what URA, SLA and OneMap use, so results line up with official maps.

So every buffer, intersection, area and distance in `sg_health/geo.py` is computed in SVY21, and the
result is converted to WGS84 only at the end, because web maps (MapLibre, Leaflet) expect longitude/latitude.

## How each measure is computed

1. **Areas and names.** URA's planning-area polygons are reprojected to SVY21. Their names are matched
   to SingStat's through an explicit table, `ref_area_name_map`: 55 of 55 match once case and spacing
   are normalised. Any name that doesn't match stops the build with the names listed; nothing is
   dropped or guessed.
2. **Clinics to areas.** Each clinic's point is placed in the planning area that contains it (spatial
   join in SVY21). A point in no area or in several is left unassigned and flagged, never snapped to
   the nearest area. All 1,192 clinics fall inside exactly one area.
3. **Per-1,000 ratios.** Active clinics in the area ÷ residents aged 65+ × 1,000. NULL where no one aged
   65+ lives.
4. **1 km coverage.** A 1 km circle is drawn around every active CDMP clinic in Singapore (including
   those across the area's border, which serve its residents too). The circles are merged and
   intersected with the area polygon; the result is the share of the polygon covered.
5. **Nearest polyclinic.** The straight-line distance from the polygon's geometric centroid to each
   polyclinic; the smallest is reported, with its name.
6. **Per-area notes.** `dq_note` records what makes an area's figures fragile: no residents, fewer than
   1,000 residents aged 65+, no CDMP clinic inside, or a centroid outside the area.
7. **Web layer.** Polygons are simplified in SVY21 with `coverage_simplify`, which keeps neighbouring
   areas meeting exactly. The gentlest tolerance that fits under 1 MB is used (5 m today). The result is
   reprojected to WGS84 and rounded to about 1 m. The file is about 345 KB; total area changes by 0.002%.

## Limitations

**Straight-line distance, not travel time.** Every distance and the 1 km coverage are "as the crow
flies". Real journeys follow roads, footpaths, bus routes and MRT lines; rivers, expressways and
industrial land can make a clinic 800 m away a 25-minute walk. For older residents, who walk more
slowly and may use mobility aids, the gap between straight-line distance and real access is largest.
A travel-time analysis (e.g. OneMap routing or a walking network) would be the next step.

**Ecological fallacy.** Every figure describes an *area*, not the people in it. A planning area with a
high clinic ratio can still contain blocks far from any clinic, and a low ratio says nothing about
whether a particular senior is underserved. Planning areas are large (Bedok alone has over 270,000
residents) and internally varied. The measures are fit for comparing areas and spotting where to look
closer, not for conclusions about individuals.

**Clinic opening hours, capacity and acceptance are ignored.** A clinic counts the same whether it opens
three mornings a week or seven days until midnight, has one doctor or six, or is taking new chronic-care
patients. The CHAS list says a clinic participates in the scheme, not how much care it provides.

Also:

- **Where clinics are, not where patients go.** Residents cross area lines, especially in small central
  areas and near borders. The 1 km coverage measure partly accounts for this; the per-1,000 ratios do not.
- **Area, not people, for the 1 km measure.** Parks, reservoirs and industrial estates count as much as
  housing estates. Jurong East's 58% partly reflects its industrial land, not just its housing.
- **The centroid is one point for a whole area.** For irregular or fragmented areas it can be far from
  where people live. For the Western Islands it lies in the sea, outside the area altogether; the
  `dq_note` flags this.
- **Mixed dates.** Clinics as of June 2024 (the latest CHAS release), residents as of June 2026. Clinics
  opened or closed since mid-2024 are missing. `as_of` reports the older date.
- **Rounding.** SingStat rounds every published cell to the nearest 10; small areas' ratios move with it.
  Areas with fewer than 1,000 residents aged 65+ are flagged.
- **Polyclinic list is a proxy.** It's HPB's cervical-screening centre list, which today includes all 26
  polyclinics. A new polyclinic appears only once HPB lists it for screening; a check warns if fewer than
  25 remain.
- **Boundary area is not land area.** The 55 URA "no sea" polygons total 797 km², more than Singapore's
  official land area (about 735 km²): water catchments and island groups contribute much of the difference.

## Choices made deliberately

| Choice | Alternative | Why |
|---|---|---|
| Planning area | Subzone (332) | 56 inhabited subzones have under 500 residents aged 65+, so one clinic swings their ratio by 2 or more per 1,000; and URA publishes no Master Plan 2025 subzone boundaries, only 2019 ones. |
| Master Plan 2025 boundaries | Master Plan 2019 | SingStat's 2026 figures use MP2025. Three areas changed shape since 2019 (Changi Bay by 83% of its area, Changi 4.4%, Pasir Ris 1.0%), so MP2019 would misplace clinics and land. |
| CDMP clinics as the lead measure | All CHAS clinics | Chronic disease management is the care most relevant to older residents; both are published. |
| 1 km radius | 500 m, 2 km | A judgement, not a standard: roughly a 10–15 minute walk for an older adult in a straight line, before detours. It's a single constant (`geo.CDMP_RADIUS_M`) so it can be changed and re-run; the measure is a proxy whatever radius is chosen. |

## What this data can't tell you

These are limits of the sources, not of the analysis, and no amount of processing removes them.

- **Anything about an individual patient.** Every source is aggregate, by design. Nothing here
  describes, or could identify, a person.
- **Who attends the ED, or how urgently.** MOH publishes attendance *counts*, with no age, triage
  category or diagnosis. So this data **cannot say how many ED attendances are by older residents, or
  how many could have been seen in primary care instead**, the central question of right-siting.
- **Why waits change.** There is no data on bed occupancy, discharges, staffing, admissions mix or
  seasonal illness. A rise or fall in waits can be described, not explained.
- **The whole ED journey.** MOH's bed wait starts at the decision to admit and covers admitted patients
  only. Waits to be triaged or seen, and the experience of patients sent home, aren't in it. NUHS's
  estimates touch on these for three sites, at single moments.
- **Whether seniors can use the clinics near them.** The clinic list says where clinics are and which
  schemes they join, not their opening hours, capacity, waiting times, fees, or whether they accept new
  chronic-care patients. Enrolment and visits are not published.
- **Care outside these lists.** Private GPs outside CHAS, home care, telemedicine and community
  nursing aren't counted.
- **Any link between clinic access and ED pressure.** The ED figures are per hospital and the access
  measures per planning area; patients don't always go to the nearest ED, and residents cross area
  lines for GP care. The two sides of this site can be read together, but **the data supports no
  causal claim, and no area-level correlation, between them**.
- **Today.** MOH publishes weekly, so the latest ED figure is several days old; the clinic list is
  from June 2024.
