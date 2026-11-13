import { describe, expect, it } from "vitest";

import { estimateCell, estimateText, nuhsTimingNote } from "./estimates";

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

describe("nuhsTimingNote", () => {
  it("says the estimate is newer than the weekly data only when it is", () => {
    expect(nuhsTimingNote("2026-11-08T22:00:44", "2026-10-31")).toBe("Published separately by NUHS, so newer than the weekly data.");
    expect(nuhsTimingNote("2026-10-20T10:00:00", "2026-10-31")).toBe("Published separately by NUHS, with its own time.");
    expect(nuhsTimingNote("2026-11-08T22:00:44", null)).toBe("Published separately by NUHS, with its own time.");
  });
});
