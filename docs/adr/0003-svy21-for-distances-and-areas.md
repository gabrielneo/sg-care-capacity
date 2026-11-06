# 0003: Compute every distance and area in SVY21 (EPSG:3414)

**Status:** Accepted · **Date:** 2026-11-06

## Context

The access measures need real distances and areas:
- clinics within 1 km;
- the share of each planning area covered by those 1 km zones;
- the distance to the nearest polyclinic;
- each area's size.

The sources give longitude and latitude (WGS84, EPSG:4326). Those are angles, not lengths, so a
"distance" in degrees isn't a distance.

## Decision

- **Every buffer, intersection, area and distance in `sg_health/geo.py` is computed in SVY21 /
  Singapore TM (EPSG:3414).** That is Singapore's national projected grid, in metres.
- **Results are converted back to WGS84 only at the end**, because web maps expect longitude and
  latitude.

## Alternatives considered

| Option | Why not |
|---|---|
| Work in WGS84 degrees | Not a length. A degree of longitude is about 111 km at the equator, less elsewhere; a 1 km buffer can't be drawn in degrees |
| Web Mercator (EPSG:3857) | Its error near the equator is small but not zero, and it isn't the grid URA, SLA or OneMap measure in |
| Geodesic calculations (ellipsoidal, e.g. pyproj `Geod`) | Exact for distances and areas, but the buffer, union and intersection operations the 1 km coverage needs work on planar geometry |

## Consequences

- **Accuracy was checked against independent calculations.** On the real data, SVY21 areas match
  geodesic areas within **0.0013%** for every planning area. Test distances of 39 km, 20 km,
  1.6 km and 1 km fall within 1% of geodesic values. See [methodology.md](../methodology.md).
- **Results line up with official maps**, because URA, SLA and OneMap use the same grid.
- **Limit: this is accuracy of geometry, not of access.** Distances are still straight-line, not
  travel time. That limitation is about the measure, not the projection
  (see [methodology.md](../methodology.md#limitations)).

## How it is enforced

- **`pipeline/tests/test_geo.py`:** checks that SVY21 distances fall within 1% of independent
  geodesic distances (pyproj `Geod`), that 1 km north measures 1 km, how much of an area its 1 km
  zones cover, the nearest-polyclinic distance, and that no geometry is invalid after reprojection.
- **Not re-checked by a test:** the 0.0013% agreement between SVY21 and geodesic *areas* was
  measured once on the real data (see [methodology.md](../methodology.md)).
