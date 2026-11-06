import { describe, expect, it } from "vitest";

import { parseEdFilters } from "./edParams";

const KNOWN = ["AH", "CGH", "NUH", "SGH"];

describe("ED Trends URL filters", () => {
  it("defaults to all hospitals and the API's default range", () => {
    expect(parseEdFilters({}, KNOWN)).toEqual({ hospitals: [], from: null, to: null, notes: [] });
  });

  it("reads repeated and comma-separated hospitals, case-insensitively, without duplicates", () => {
    expect(parseEdFilters({ hospital: ["sgh", "CGH,ah", "SGH"] }, KNOWN).hospitals).toEqual(["SGH", "CGH", "AH"]);
  });

  it("drops unknown codes and malformed dates, and says so", () => {
    const f = parseEdFilters({ hospital: ["SGH", "XYZ"], from: "2026-02-30", to: "31/10/2026" }, KNOWN);
    expect(f.hospitals).toEqual(["SGH"]);
    expect([f.from, f.to]).toEqual([null, null]);
    expect(f.notes).toEqual(["Ignored unknown hospital code: XYZ.", 'Ignored "from=2026-02-30": use a date like 2026-10-31.',
                             'Ignored "to=31/10/2026": use a date like 2026-10-31.']);
  });

  it("passes valid dates through (the API checks the 2-year limit)", () => {
    expect(parseEdFilters({ from: "2024-01-01", to: "2026-10-31" }, KNOWN)).toMatchObject({ from: "2024-01-01", to: "2026-10-31" });
  });
});
