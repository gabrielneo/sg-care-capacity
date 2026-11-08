import { describe, expect, it } from "vitest";

import {
  cameraEnd,
  cameraStart,
  chooseView,
  easeOutCubic,
  EXCLUDED_COLOUR,
  FLAT_METRES,
  fitDistance,
  heightOf,
  heightSteps,
  INTRO_MS,
  introPosition,
  METRES_PER_STEP,
  polygons,
  shortfallText,
  styleAreas,
  type Svy21Feature,
} from "./map3d";
import { mapScale } from "./palette";

const feature = (name: string, seniors: number | null, rate: number | null, extra: Partial<Svy21Feature["properties"]> = {}): Svy21Feature => ({
  type: "Feature",
  geometry: { type: "Polygon", coordinates: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]] },
  properties: {
    planning_area_code: name.slice(0, 2).toUpperCase(), planning_area: name, region_name: null, population_year: 2026,
    residents_total: null, residents_65plus: seniors, chas_clinics: null, cdmp_clinics: null, clinics_per_1k_seniors: null,
    cdmp_clinics_per_1k_seniors: rate, pct_area_within_1km_of_cdmp: null, approx_km_centroid_to_nearest_polyclinic: null,
    nearest_polyclinic: null, dq_note: null, as_of: null, as_of_basis: null, excluded_reason: null, cdmp_shortfall: null,
    label_x: 50, label_y: 50, ...extra,
  },
});

describe("height", () => {
  it("is linear: one step per 10,000 residents aged 65+", () => {
    expect(heightOf({ residents_65plus: 10_000, excluded_reason: null })).toBe(METRES_PER_STEP);
    expect(heightOf({ residents_65plus: 50_140, excluded_reason: null })).toBeCloseTo(5.014 * METRES_PER_STEP);
    expect(heightSteps(67_290)).toBe(7);
  });

  it("an area left out of the ranking is flat, whatever its seniors", () => {
    expect(heightOf({ residents_65plus: 900, excluded_reason: "fewer than 1,000 residents aged 65+" })).toBe(FLAT_METRES);
    expect(heightOf({ residents_65plus: null, excluded_reason: null })).toBe(FLAT_METRES);
  });
});

describe("styleAreas", () => {
  const rates = [0.5, 0.8, 1.0, 1.2, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0];
  const features = [...rates.map((r, i) => feature(`Area ${i}`, 5000 + i * 1000, r)),
                    feature("Tiny", 400, 10, { excluded_reason: "fewer than 1,000 residents aged 65+" })];

  it("darker = fewer clinics: the lowest rates get the darkest colour", () => {
    const { areas, classes } = styleAreas(features);
    expect(areas[0]!.color).toBe(mapScale[4]);
    expect(areas[9]!.color).toBe(mapScale[0]);
    expect(classes[0]!.color).toBe(mapScale[4]);
  });

  it("excluded areas are grey and take no part in the groups", () => {
    const { areas, classes, excluded } = styleAreas(features);
    const tiny = areas.find((a) => a.name === "Tiny")!;
    expect([tiny.color, tiny.excluded, tiny.height]).toEqual([EXCLUDED_COLOUR, true, FLAT_METRES]);
    expect(classes.reduce((n, c) => n + c.count, 0)).toBe(10);                // its rate of 10 isn't grouped
    expect(excluded).toBe(1);
  });
});

describe("polygons", () => {
  it("reads holes and multipolygons", () => {
    const ring = [[0, 0], [10, 0], [10, 10], [0, 0]];
    const hole = [[2, 2], [3, 2], [3, 3], [2, 2]];
    expect(polygons({ type: "Polygon", coordinates: [ring, hole] })).toEqual([{ outer: ring, holes: [hole] }]);
    expect(polygons({ type: "MultiPolygon", coordinates: [[ring], [ring, hole]] })).toHaveLength(2);
  });
});

describe("shortfallText", () => {
  it("rounds as the findings do, and says more or fewer", () => {
    expect(shortfallText({ cdmp_shortfall: 13.46, excluded_reason: null })).toBe("About 13 fewer chronic-care clinics than the national rate would give");
    expect(shortfallText({ cdmp_shortfall: -1.2, excluded_reason: null })).toBe("About 1 more chronic-care clinic than the national rate would give");
    expect(shortfallText({ cdmp_shortfall: 0.3, excluded_reason: null })).toBe("About the same as the national rate");
    expect(shortfallText({ cdmp_shortfall: null, excluded_reason: "no residents aged 65+" })).toBe("Not ranked: no residents aged 65+");
  });
});

describe("chooseView", () => {
  const all = { webgl: true, reducedMotion: false, lowMemory: false };

  it("3D by default where the device can run it", () => {
    expect(chooseView("auto", all)).toEqual({ view: "3d", reason: null });
  });

  it("falls back to 2D without WebGL, even when 3D is asked for", () => {
    for (const asked of ["auto", "3d"] as const) {
      const c = chooseView(asked, { ...all, webgl: false });
      expect(c.view).toBe("2d");
      expect(c.reason).toMatch(/no WebGL/);
    }
  });

  it("reduced motion and low memory mean 2D unless 3D is asked for", () => {
    expect(chooseView("auto", { ...all, reducedMotion: true })).toEqual({ view: "2d", reason: "Reduced motion is on, so the 2D map is shown." });
    expect(chooseView("auto", { ...all, lowMemory: true }).view).toBe("2d");
    expect(chooseView("3d", { ...all, reducedMotion: true, lowMemory: true }).view).toBe("3d");
    expect(chooseView("2d", all)).toEqual({ view: "2d", reason: null });
  });
});

describe("the camera", () => {
  it("stands farther back on a narrow (phone) canvas, so the whole island fits", () => {
    expect(fitDistance(0.8)).toBeGreaterThan(fitDistance(1.6));
    expect(fitDistance(3)).toBe(fitDistance(4));                      // wide canvases: the height decides
  });

  it("the intro runs from straight down to oblique in under 2 seconds, easing out", () => {
    const d = fitDistance(1.4);
    expect(INTRO_MS).toBeLessThan(2000);
    expect(introPosition(0, d)).toEqual(cameraStart(d));
    expect(introPosition(INTRO_MS, d)).toEqual(cameraEnd(d));
    expect(introPosition(INTRO_MS * 5, d)).toEqual(cameraEnd(d));
    expect(cameraEnd(d)[1]).toBeGreaterThan(0);                       // above the map, never under it
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});
