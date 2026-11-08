import { describe, expect, it } from "vitest";

import type { EdWeek } from "./api/types";
import { usualLevels } from "./edCompare";
import { byPressure, hospitalStatus, levelFor, LEVELS, sparkPath, sparkWeeks } from "./status";

const week = (code: string, start: string, v: number | null, complete = true): EdWeek => ({
  hospital_code: code, hospital_name: code, iso_year: 2026, iso_week: 0, week_start: start, week_end: start,
  mean_of_daily_median_wait_hours: v, total_attendances: null, days_reported_wait: 7, days_reported_attendances: 7,
  is_complete_week: complete, source_sha256: "x", as_of: "2026-10-31", as_of_basis: "fetched",
});
const LATEST = "2026-10-19";
const starts = sparkWeeks(LATEST);

describe("levelFor: the badge thresholds", () => {
  it.each([
    [30, "much_higher"], [29.9, "higher"], [15, "higher"], [14.9, "usual"], [0, "usual"],
    [-14.9, "usual"], [-15, "lower"], [-40, "lower"],
  ] as const)("%s%% vs usual is %s", (pct, level) => expect(levelFor(pct)).toBe(level));

  it("has no usual level: no comparison, never 'about usual'", () => {
    expect(levelFor(null)).toBe("unknown");
    expect(levelFor(undefined)).toBe("unknown");
    expect(levelFor(Number.NaN)).toBe("unknown");
    expect(LEVELS.unknown.tone).toBe("none");
  });

  it("every badge has a shape as well as a colour", () => {
    expect(new Set(Object.values(LEVELS).map((l) => l.icon)).size).toBe(5);
  });
});

describe("hospitalStatus", () => {
  it("compares the latest complete week with the median of the 8 before it", () => {
    const weekly = [...starts.slice(3, 11).map((s) => week("SGH", s, 4)), week("SGH", LATEST, 5.4)];
    const s = hospitalStatus("SGH", usualLevels(weekly, ["SGH"], LATEST).SGH, weekly, LATEST);
    expect(s).toMatchObject({ level: "much_higher", latest: 5.4, usual: 4 });
    expect(s.pct).toBeCloseTo(35);
  });

  it("keeps an incomplete week as a gap in the sparkline, and has 12 points", () => {
    const weekly = starts.map((s, i) => week("AH", s, 2, i !== 5));
    const s = hospitalStatus("AH", usualLevels(weekly, ["AH"], LATEST).AH, weekly, LATEST);
    expect(s.spark).toHaveLength(12);
    expect(s.spark[5]).toBeNull();
    // That week is one of the 8 the usual level needs, so there is no comparison: all 8, or none.
    expect(s.level).toBe("unknown");
    const outside = starts.map((s, i) => week("AH", s, 2, i !== 1));        // week 1 is before the 8
    expect(hospitalStatus("AH", usualLevels(outside, ["AH"], LATEST).AH, outside, LATEST).level).toBe("usual");
  });

  it("with too few weeks, has no comparison", () => {
    const weekly = [week("WH", LATEST, 6)];
    const s = hospitalStatus("WH", usualLevels(weekly, ["WH"], LATEST).WH, weekly, LATEST);
    expect(s).toMatchObject({ level: "unknown", latest: 6, usual: null, pct: null });
  });

  it("sorts the busiest first and hospitals without a comparison last", () => {
    const mk = (code: string, pct: number | null) => ({ code, level: levelFor(pct), latest: null, usual: null, pct, spark: [] });
    expect([mk("A", 5), mk("B", null), mk("C", 40), mk("D", -20)].sort(byPressure).map((s) => s.code)).toEqual(["C", "A", "D", "B"]);
  });
});

describe("sparkPath", () => {
  it("breaks the line at a missing week instead of joining across it", () => {
    const d = sparkPath([1, 2, null, 3], 100, 20);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/L/g)).toHaveLength(1);
  });

  it("puts the highest value at the top", () => {
    const d = sparkPath([1, 3], 100, 20, 2);
    expect(d).toBe("M2.0 18.0L98.0 2.0");
  });

  it("draws nothing without values", () => {
    expect(sparkPath([null, null], 100, 20)).toBe("");
  });
});
