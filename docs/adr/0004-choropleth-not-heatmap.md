# 0004: Show access as a choropleth with clinic points, not a heatmap

**Status:** Accepted · **Date:** 2026-11-06

## Context

The Access Map compares where CHAS and CDMP clinics are with where residents aged 65+ live. The two
inputs are different kinds of data:

- **Residents are areal data.** SingStat publishes counts per planning area and subzone, not where
  each person lives. The count belongs to the whole area.
- **Clinics are point data.** Each has an address and a location.

A heatmap (kernel density) is a common default for "where are the people?"

## Decision

- **A choropleth:** each planning area shaded by a **rate** (CDMP or CHAS clinics per 1,000
  residents aged 65+, and the other access measures). Never shaded by a count.
- **Clinics drawn as points** on top, which can be filtered to CDMP only.
- **"No data" has its own hatched style**, never the lowest colour. 13 areas have no residents
  aged 65+.
- **Five quantile classes**, with the method stated in the legend. Tied values merge classes.
  Areas with fewer than 1,000 residents aged 65+ are flagged, because one clinic swings their ratio.
- **The same figures are available as a sortable table**, for screen readers and anyone who would
  rather read numbers.

## Alternatives considered

| Option | Why not |
|---|---|
| Heatmap of residents | It would have to invent where inside each area people live, and draw hot spots the data never contained: fabrication, which the project's data principles rule out |
| Heatmap of clinics | Blurs exact locations into a surface; the points are more honest and just as readable |
| Shading by counts | Mostly shows area size: big areas have more of everything |
| Subzones instead of planning areas | 56 inhabited subzones have under 500 residents aged 65+, and URA publishes no Master Plan 2025 subzone boundaries |
| Equal-interval or Jenks classes | A few small areas with extreme ratios (e.g. 100 per 1,000) would squeeze everyone else into one class; quantiles spread the areas out, and the legend states the method |

## Consequences

- **The map shows exactly what the data contains:** one number per area, with the boundary it
  applies to.
- **It invites the ecological fallacy.** An area figure says nothing about any one person in it.
  [methodology.md](../methodology.md#limitations) says so, and the legend and area panel point to it.
- **Quantile classes are relative.** "Darkest" means "among the highest of these 42 areas", not
  "good enough".

## How it is enforced

- **`pipeline/tests/test_geo.py`:** checks the map layer keeps missing values as `null`, never
  `0` or `NaN`, and keeps all 55 areas.
- **`web/lib/quantiles.test.ts`:** checks the class breaks, merged ties, and that no-data areas
  are never classed.
- **`web/e2e/access-map.spec.ts`:** checks the legend states the method and counts no-data areas,
  and that the table view matches the map.
