import { describe, expect, it } from "vitest";

import { niceAxis, niceStep, symmetricAxis, tickText } from "./axis";

describe("axis", () => {
  it("picks a round step from the data's largest value", () => {
    expect(niceStep(10.7)).toBe(5);
    expect(niceStep(7.9)).toBe(2);
    expect(niceStep(3)).toBe(1);
    expect(niceStep(0.9)).toBe(0.25);
    expect(niceStep(0)).toBe(1);
    expect(niceStep(Number.NaN)).toBe(1);
  });

  it("runs from 0 to the first tick at or above the largest value, so every dot is on the scale", () => {
    expect(niceAxis(10.7)).toEqual({ max: 15, step: 5, ticks: [0, 5, 10, 15] });
    expect(niceAxis(8)).toEqual({ max: 8, step: 2, ticks: [0, 2, 4, 6, 8] });
    for (const top of [0.4, 1, 3.3, 11.2, 47, 260]) {
      const a = niceAxis(top);
      expect(a.max).toBeGreaterThanOrEqual(top);
      expect(a.ticks.at(-1)).toBe(a.max);
      expect(a.ticks.length).toBeLessThanOrEqual(6);
    }
  });

  it("a symmetric axis has 0 in the middle and the same extent both ways", () => {
    const a = symmetricAxis(56);
    expect(a.ticks[0]).toBe(-a.max);
    expect(a.ticks.at(-1)).toBe(a.max);
    expect(a.ticks).toContain(0);
    expect(a.max).toBeGreaterThanOrEqual(56);
  });

  it("labels use only the decimals the step needs", () => {
    expect(tickText(10, 5)).toBe("10");
    expect(tickText(0.5, 0.5)).toBe("0.5");
    expect(tickText(0.25, 0.25)).toBe("0.25");
  });
});
