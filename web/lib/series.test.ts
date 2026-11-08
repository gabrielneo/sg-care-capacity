import { describe, expect, it } from "vitest";

import { eachDay, missingDays, type WideRow } from "./series";

describe("daily series", () => {
  it("lists every day in the range", () => {
    expect(eachDay("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("counts absent days and null values alike as missing", () => {
    const wide = [{ date: "2026-10-01", AH: null, SGH: 4 }, { date: "2026-10-02", AH: null }, { date: "2026-10-03", AH: 2, SGH: 5 }] as WideRow[];
    expect(missingDays(wide, ["AH", "SGH"])).toEqual({ AH: 2, SGH: 1 });
  });
});
