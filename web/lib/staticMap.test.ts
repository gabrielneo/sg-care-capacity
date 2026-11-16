import { describe, expect, it } from "vitest";

import type { AreaStyle, Svy21Feature } from "./map3d";
import { METRES_PER_UNIT, staticMap } from "./staticMap";

const square = (x: number, y: number, s: number): Svy21Feature["geometry"] =>
  ({ type: "Polygon", coordinates: [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]] }) as Svy21Feature["geometry"];
const feature = (code: string, geometry: Svy21Feature["geometry"]) => ({ type: "Feature", geometry, properties: { planning_area_code: code } }) as unknown as Svy21Feature;
const style = (code: string, excluded = false): AreaStyle => ({ code, name: code, height: 0, color: "#123456", excluded, props: {} as AreaStyle["props"] });

describe("staticMap", () => {
  it("draws north up: a shape further north has a smaller y", () => {
    const m = staticMap([feature("S", square(0, 0, 1000)), feature("N", square(0, 5000, 1000))], [style("S"), style("N")])!;
    const y = (code: string) => Number(/^M\d+ (\d+)/.exec(m.shapes.find((s) => s.code === code)!.d)![1]);
    expect(y("N")).toBeLessThan(y("S"));
    expect(m.height).toBe(Math.round(6000 / METRES_PER_UNIT));
    expect(m.width).toBe(Math.round(1000 / METRES_PER_UNIT));
  });

  it("keeps each area's colour, its excluded flag, and its holes and extra parts as separate subpaths", () => {
    const multi = { type: "MultiPolygon", coordinates: [[[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]], [[20, 20], [40, 20], [40, 40], [20, 40], [20, 20]]],
      [[[500, 0], [600, 0], [600, 100], [500, 100], [500, 0]]]] } as unknown as Svy21Feature["geometry"];
    const m = staticMap([feature("A", multi)], [style("A", true)])!;
    expect(m.shapes[0]).toMatchObject({ code: "A", color: "#123456", excluded: true });
    expect(m.shapes[0]!.d.match(/M/g)).toHaveLength(3);
    expect(m.shapes[0]!.d.match(/Z/g)).toHaveLength(3);
  });

  it("returns nothing when there is no geometry, and skips a shape that collapses to a point", () => {
    expect(staticMap([], [])).toBeNull();
    const tiny = staticMap([feature("T", square(0, 0, 1)), feature("B", square(0, 0, 5000))], [style("T"), style("B")])!;
    expect(tiny.shapes.map((s) => s.code)).toEqual(["B"]);
  });
});
