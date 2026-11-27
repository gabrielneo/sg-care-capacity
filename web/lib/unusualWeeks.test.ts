import { describe, expect, it } from "vitest";

import type { EdWeek } from "./api/types";
import { latestCompleteWeek, usualLevels } from "./edCompare";
import { levelFor } from "./status";
import { tallySentence, weekGrid, weekTally } from "./unusualWeeks";

const DAY = 86_400_000;
const start = (k: number) => new Date(Date.parse("2025-01-06T00:00:00Z") + k * 7 * DAY).toISOString().slice(0, 10);
const week = (code: string, k: number, v: number | null, complete = true): EdWeek => ({
  hospital_code: code, hospital_name: code, iso_year: 2025, iso_week: 0, week_start: start(k), week_end: start(k),
  mean_of_daily_median_wait_hours: v, total_attendances: null, days_reported_wait: 7, days_reported_attendances: 7,
  is_complete_week: complete, source_sha256: "x", as_of: "2026-10-31", as_of_basis: "fetched",
});
// 40 weeks of a hospital that swings a little (4 +/- 0.3), with a spike at week 30 and a gap at week 35.
const wobble = (k: number) => 4 + 0.3 * Math.sin(k * 1.7);
const SGH = Array.from({ length: 40 }, (_, k) => week("SGH", k, k === 30 ? 9 : wobble(k), k !== 35));

describe("weekGrid", () => {
  const grid = weekGrid(SGH, [{ hospital_code: "SGH" }]);
  const [row] = grid.rows;

  it("judges the latest week exactly as the status badge does", () => {
    const latest = latestCompleteWeek(SGH) as string;
    const u = usualLevels(SGH, ["SGH"], latest).SGH!;
    expect(row!.levels.at(-1)).toBe(levelFor(u.pct, u.position, u.z));
  });

  it("marks a planted spike, and leaves weeks without a comparison or a figure as gaps", () => {
    expect(row!.levels[30]).toBe("much_higher");
    expect(row!.levels.slice(0, 8).every((l) => l === "unknown")).toBe(true);    // no 8 weeks before them
    expect(row!.levels[35]).toBe("unknown");                                       // not complete
  });

  it("knows which weeks the 26-week rule judged, and which the older rule did", () => {
    expect(row!.byZ[10]).toBe(false);                                               // 10 weeks of history: the older rule
    expect(row!.byZ[30]).toBe(true);
  });

  it("tallies how often the 26-week rule marked a week", () => {
    const t = weekTally(grid.rows);
    expect(t.muchHigher).toBe(1);
    expect(t.higher).toBeGreaterThanOrEqual(1);
    expect(tallySentence(t)).toMatch(/^Of \d+ hospital-weeks with enough history for the 26-week rule, [\d.]+% were higher than usual \([\d.]+% much higher\) and [\d.]+% lower\.$/);
    expect(tallySentence({ judged: 0, higher: 0, muchHigher: 0, lower: 0 })).toBeNull();
  });
});
