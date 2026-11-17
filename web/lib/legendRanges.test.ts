import { describe, expect, it } from "vitest";

import { formatValue } from "./areaMetrics";
import { classRanges } from "./legendRanges";
import type { LegendClass } from "./quantiles";

const cls = (pairs: [number, number][]): LegendClass[] => pairs.map(([min, max], index) => ({ index, min, max, count: 1, color: "" }));

describe("classRanges", () => {
  it("ranges meet with no gap: each class after the first is 'over' the one below", () => {
    expect(classRanges(cls([[0, 0.8912], [0.9001, 1.0617], [1.1, 1.2381], [1.2441, 1.36], [1.44, 5.0167]]), 2, formatValue)).toEqual([
      "0.00 to 0.89", "over 0.89 to 1.06", "over 1.06 to 1.24", "over 1.24 to 1.36", "over 1.36 to 5.02"]);
  });

  it("adds a decimal only when two boundaries would print the same", () => {
    expect(classRanges(cls([[0.5, 1.2381], [1.2441, 1.2449], [1.3, 2]]), 2, formatValue)).toEqual([
      "0.500 to 1.238", "over 1.238 to 1.245", "over 1.245 to 2.000"]);
  });

  it("a one-value first class is that value; no classes, no words", () => {
    expect(classRanges(cls([[2, 2], [3, 4]]), 0, formatValue)).toEqual(["2", "over 2 to 4"]);
    expect(classRanges([], 2, formatValue)).toEqual([]);
  });
});
