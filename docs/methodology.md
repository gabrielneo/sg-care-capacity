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
| Hospital Admissions and Public Sector Outpatient Attendances | data.gov.sg (MOH) | Annual A&E attendances, used **only** to cross-check the daily MOH series | Yearly | data.gov.sg API |

Every figure on the site shows the date its data was current (`as_of`) and its source. The Data
Quality page shows each source's current date and how fresh it is for how often it changes.

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

**NUHS estimates are a different measure.** NUHS's page shows its own *estimates* at one moment
(patients waiting, estimated wait to see a doctor, estimated wait for a bed). They are not MOH's
daily median of admitted patients and are only ever shown side by side with it, labelled as estimates.
On this site they come from the weekly snapshot, so they can be up to 7 days old.

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

## Why a choropleth, not a heatmap

**Population is areal data.** SingStat publishes resident counts *per planning area and subzone*, not
the location of each resident. The count belongs to the whole area; nothing in the data says where
inside it people live.

- A **choropleth** shades each area by its value. It shows exactly what the data contains: one number
  per area, with the boundary it applies to.
- A **heatmap** (kernel density) spreads values smoothly across space. Applied to areal counts, it would
  have to invent where within each area residents live, and draw hot spots that the data never
  contained. That is fabrication, which CLAUDE.md rules out.

Clinics *are* point data, so on the map they belong as **points** (or circles) over the choropleth, not
blurred into a density surface either.

Two more rules for the choropleth:

- **Shade a rate, not a count.** Larger areas naturally have more clinics and more residents; shading
  counts would mostly show area size. The lead measure is per 1,000 residents aged 65+.
- **Show "no data" as its own style**, not the lowest colour. 13 planning areas have no residents
  (water catchments, Tuas, some islands), so their ratio is NULL and must look different from a low
  ratio.

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
   reprojected to WGS84 and rounded to about 1 m. The file is 342 KB; total area changes by 0.002%.

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
