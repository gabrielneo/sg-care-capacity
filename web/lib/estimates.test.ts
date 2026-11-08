import { describe, expect, it } from "vitest";

import { estimateCell, estimateText } from "./estimates";

describe("estimateText", () => {
  it.each([
    [1, null, "1 hour"], [2, null, "2 hours"], [1.5, null, "1.5 hours"], [null, null, "Not stated"],
    [1, "<", "under 1 hour"], [12, ">", "over 12 hours"], [null, "<", "Not stated"],
  ] as const)("%s with bound %s reads %j", (hours, bound, text) => {
    expect(estimateText(hours, bound)).toBe(text);
  });

  it("never shows a bound as a plain value", () => {
    expect(estimateText(1, "<")).not.toBe("1 hour");
    expect(estimateCell(1, "<")).toBe("Under 1 hour");
  });
});
