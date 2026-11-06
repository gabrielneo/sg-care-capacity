import { describe, expect, it } from "vitest";

import type { EdDay } from "./api/types";
import { dailyWide, dayOfWeek, eachDay, formatDay, missingDays, scatterPoints, weekday } from "./series";

function day(code: string, date: string, wait: number | null, att: number | null = 100): EdDay {
  return { hospital_code: code, hospital_name: code, report_date: date, iso_year: 2026, iso_week: 40, median_wait_hours: wait,
           attendances: att, is_complete_week: false, dq_flags: [], wait_source_url: null, wait_source_sha256: null,
           attendance_source_url: null, attendance_source_sha256: null, as_of: "2026-11-06T16:33:44", as_of_basis: "fetched" };
}

describe("daily series", () => {
  it("lists every day in the range", () => {
    expect(eachDay("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("fills absent days and null values with null, so the line has a gap", () => {
    const rows = [day("SGH", "2026-10-01", 4), day("SGH", "2026-10-03", 5), day("AH", "2026-10-02", null)];
    const wide = dailyWide(rows, ["AH", "SGH"], "2026-10-01", "2026-10-03");
    expect(wide).toEqual([
      { date: "2026-10-01", AH: null, SGH: 4 },
      { date: "2026-10-02", AH: null, SGH: null },                          // absent row: null, not 0
      { date: "2026-10-03", AH: null, SGH: 5 },
    ]);
    expect(missingDays(wide, ["AH", "SGH"])).toEqual({ AH: 3, SGH: 1 });
  });
});

describe("day of week", () => {
  it("averages each weekday's medians and counts the days", () => {
    expect(weekday("2026-10-19")).toBe(0);                                // a Monday
    expect(weekday("2026-10-25")).toBe(6);
    const rows = [day("SGH", "2026-10-19", 4), day("SGH", "2026-10-26", 6), day("SGH", "2026-10-20", null)];
    const dow = dayOfWeek(rows, ["SGH"]);
    expect(dow[0]).toMatchObject({ day: "Mon", SGH: 5, SGH_n: 2 });
    expect(dow[1]).toMatchObject({ day: "Tue", SGH: null, SGH_n: 0 });     // only a null day: no value
  });
});

describe("scatter", () => {
  it("keeps days with both values and counts the rest", () => {
    const rows = [day("SGH", "2026-10-01", 4, 400), day("SGH", "2026-10-02", null, 410), day("SGH", "2026-10-03", 5, null),
                  day("CGH", "2026-10-01", 3, 300)];
    const { points, excluded } = scatterPoints(rows, ["SGH"]);
    expect(points.SGH).toEqual([{ date: "2026-10-01", wait: 4, attendances: 400 }]);
    expect(excluded).toBe(2);
  });
});

it("formats tooltip dates with the weekday", () => {
  expect(formatDay("2026-10-31")).toBe("Sat, 31 Oct 2026");
});
