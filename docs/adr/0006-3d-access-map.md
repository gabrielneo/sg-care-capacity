# 0006: A 3D access map beside the 2D map, never instead of it

**Status:** Accepted · **Date:** 2026-11-08

## Context

The access finding has two parts: **how many seniors** an area has, and **how many CDMP clinics per
senior** it has. The priority areas are the ones with many seniors *and* few clinics. The 2D map
([0004](0004-choropleth-not-heatmap.md)) shades one rate at a time. A reader has to compare it with the
population figures in the table to see both parts at once.

A 3D map (each area raised by its seniors, coloured by its clinic rate) shows both together. But 3D has
known costs:

- **Perspective** makes near areas look bigger than far ones.
- **Tall areas hide** the ones behind them.
- **Height and colour are compared less accurately** than position on a common scale.

## Decision

- **A 3D view on the Access Map**, the default where the device can run it:
  - **Height** is residents aged 65+, on a linear scale stated in the legend (one step per 10,000).
    A count is right for height: the point is to show where seniors are. The **colour stays a rate**,
    as [0004](0004-choropleth-not-heatmap.md) requires.
  - **Colour** is CDMP clinics per 1,000 residents aged 65+, in five groups with equal numbers of
    areas. Darker means fewer clinics, as on the 2D map, where darker now means worse access on every
    measure.
  - **Areas with fewer than 1,000 seniors** are flat and grey: one clinic swings their ratio, so the
    findings leave them out too.
- **Never the only way to read the finding:**
  - The 2D map and the sortable table stay one click away.
  - A quadrant chart (seniors against clinics per senior) and the shortfall bars sit beside the map,
    from the same data.
  - The 2D map is shown instead when there is no WebGL, when reduced motion is on, or when the device
    reports low memory.
- **No projection in the browser:** the pipeline exports the areas in SVY21 metres around Singapore's
  centre ([0003](0003-svy21-for-distances-and-areas.md)). The shortfall and exclusion come from the
  insight engine's own code.
- **Libraries:**
  - three.js draws the 3D map.
  - @react-three/fiber builds the scene from React state, so hover and click share the side panel,
    and it redraws only on change.
  - @react-three/drei supplies two pieces: orbit controls with limits, and the HTML labels.
  - All three load only when the 3D view opens (about 250 KB gzipped), after the page has painted.

## Alternatives considered

| Option | Why not |
|---|---|
| 2D map only | Seniors and access can't be seen together; the reader has to cross-check the table. |
| MapLibre GL fill-extrusion | Needs longitude/latitude and projects in the browser; a second map library beside Leaflet. |
| deck.gl | Larger, and more than 55 extruded shapes need. |
| Plain three.js, no React renderer | About 45 KB smaller, but raycasting, resizing, render-on-demand and clean-up by hand. |
| Bivariate colour on the 2D map | Hard to read without training; colour-blind-safe bivariate palettes are few. |

## Consequences

- **More to load on one page:** 250 KB gzipped, only for the 3D view. Other pages are untouched.
- **3D can mislead:**
  - The legend states the height scale.
  - The camera can't go under the map.
  - The quadrant chart gives the exact positions that height and colour only suggest.
- **Not keyboard-operable:** the 3D canvas can't be used from the keyboard. The 2D map and the table
  can, and the 3D view links to both.
- **WebGL in tests:** Chromium's software renderer (SwiftShader) draws the scene in CI, so the 3D
  path is tested end to end, alongside the fallbacks.

## How it is enforced

- **Unit tests** (`web/lib/map3d.test.ts`):
  - Heights are linear in seniors, and excluded areas are flat.
  - Darker means fewer clinics.
  - The view choice: no WebGL means 2D whatever was asked; reduced motion and low memory mean 2D
    unless 3D was asked for.
  - The intro move is under 2 seconds.
- **Playwright** (`web/e2e/access-map.spec.ts`):
  - With WebGL off, the 2D map shows, with the reason.
  - The 3D / 2D / table switch works.
  - The labels come from the findings.
  - Every chart shows "Data as of".
  - axe passes on the 3D view.
- **Pipeline tests** (`pipeline/tests/test_geo.py`):
  - The SVY21 layer is in whole metres around its recorded origin.
  - It matches the WGS84 layer.
  - Its shortfall equals the insight engine's.
