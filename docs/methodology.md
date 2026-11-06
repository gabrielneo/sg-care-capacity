# Methodology: clinic access for residents aged 65+

How the planning-area access measures in `marts.fct_area_access` and the web map layer
`planning_area_access.geojson` are built, why they're built that way, and what they can't tell you.
Column definitions are in [data_dictionary.md](data_dictionary.md); the checks that guard them are
in [data_quality.md](data_quality.md).

## What is measured

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
