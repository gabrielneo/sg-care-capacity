import { describe, expect, it } from "vitest";

import { mapScale } from "./palette";
import { classColors, classify, legendClasses, quantileBreaks } from "./quantiles";

describe("quantile breaks", () => {
  const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it("cuts sorted values into equal-sized groups", () => {
    expect(quantileBreaks(ten)).toEqual([2, 4, 6, 8]);
    expect(legendClasses(ten, quantileBreaks(ten)).map((c) => c.count)).toEqual([2, 2, 2, 2, 2]);
  });

  it("ignores missing values: they are 'no data', not a class", () => {
    expect(quantileBreaks([null, ...ten, undefined, Number.NaN])).toEqual([2, 4, 6, 8]);
    expect(classify(null, [2, 4])).toBe(-1);
    expect(classify(Number.NaN, [2, 4])).toBe(-1);
  });

  it("merges tied breaks, so there may be fewer classes", () => {
    const tied = [0, 0, 0, 0, 0, 0, 1, 2, 3, 4];
    const breaks = quantileBreaks(tied);
    expect(breaks).toEqual([0, 2]);                                       // positions 2, 4 and 6 are all 0
    expect(legendClasses(tied, breaks).map((c) => [c.min, c.max, c.count])).toEqual([[0, 0, 6], [1, 2, 2], [3, 4, 2]]);
  });

  it("handles tiny and empty inputs", () => {
    expect(quantileBreaks([])).toEqual([]);
    expect(quantileBreaks([5])).toEqual([]);
    expect(quantileBreaks([5, 5, 5])).toEqual([]);
    expect(legendClasses([5, 5], [])).toEqual([{ index: 0, min: 5, max: 5, count: 2, color: mapScale[2] }]);
  });

  it("classifies values at a break into the lower class", () => {
    expect([1, 2, 2.5, 8, 9, 100].map((v) => classify(v, [2, 4, 6, 8]))).toEqual([0, 0, 1, 3, 4, 4]);
  });

  it("spreads colours across the scale for fewer classes", () => {
    expect(classColors(5)).toEqual([...mapScale]);
    expect(classColors(3)).toEqual([mapScale[0], mapScale[2], mapScale[4]]);
    expect(classColors(2)).toEqual([mapScale[0], mapScale[4]]);
  });
});
