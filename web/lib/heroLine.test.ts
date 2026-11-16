import { describe, expect, it } from "vitest";

import { drawLine } from "./heroLine";

const pts = (...v: (number | null)[]) => v.map((value, i) => ({ label: `m${i}`, value }));

describe("drawLine", () => {
  it("draws one unbroken run as one path, with the last point marked", () => {
    const d = drawLine(pts(4, 6, 5), 100, 50, 0);
    expect(d.paths).toHaveLength(1);
    expect(d.paths[0]).toMatch(/^M0\.0 \S+ L50\.0 \S+ L100\.0 \S+$/);
    expect(d.last).toMatchObject({ x: 100, value: 5, label: "m2" });
  });

  it("starts at 0, so a value's height is its share of the top", () => {
    const d = drawLine(pts(5, 10), 100, 100, 0);
    expect(d.top).toBeCloseTo(11, 6);                    // the highest value plus 10%
    const [a, b] = d.paths[0]!.split(" L");
    expect(Number(a!.split(" ")[1])).toBeCloseTo(100 - (5 / 11) * 100, 1);
    expect(Number(b!.split(" ")[1])).toBeCloseTo(100 - (10 / 11) * 100, 1);
  });

  it("breaks the line at a missing month and never joins across it", () => {
    const d = drawLine(pts(4, 5, null, 6, 7), 100, 50);
    expect(d.paths).toHaveLength(2);
    expect(d.areas).toHaveLength(2);
    expect(d.dots).toEqual([]);
  });

  it("a lone point between gaps is a dot, not a line", () => {
    const d = drawLine(pts(4, null, 6, null, 7, 8), 100, 50);
    expect(d.dots).toHaveLength(2);                         // the 4 and the 6 stand alone
    expect(d.paths).toHaveLength(1);                        // the 7 and the 8 are joined
  });

  it("closes each area down to the axis", () => {
    expect(drawLine(pts(4, 5), 100, 50, 8).areas[0]).toMatch(/ Z$/);
  });

  it("draws nothing, and says there is no last point, when nothing is known", () => {
    expect(drawLine(pts(null, null), 100, 50)).toEqual({ paths: [], dots: [], areas: [], last: null, top: 0 });
    expect(drawLine([], 100, 50).last).toBeNull();
  });
});
