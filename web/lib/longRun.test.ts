import { describe, expect, it } from "vitest";

import type { EdWeek, InsightTest } from "./api/types";
import { scatterPoints, trendSentence, trendWindow, weeklyLine, zeroScale } from "./longRun";

const DAY = 86_400_000;
const start = (k: number) => new Date(Date.parse("2024-12-16T00:00:00Z") + k * 7 * DAY).toISOString().slice(0, 10);
const week = (k: number, v: number | null, complete = true, code = "SGH"): EdWeek => ({
  hospital_code: code, hospital_name: code, iso_year: 2024, iso_week: 0, week_start: start(k), week_end: start(k),
  mean_of_daily_median_wait_hours: v, total_attendances: null, days_reported_wait: 7, days_reported_attendances: 7,
  is_complete_week: complete, source_sha256: "x", as_of: "2026-10-31", as_of_basis: "fetched",
});
const trend = (o: Partial<InsightTest>): InsightTest => ({
  type: "trend", entity: "SGH", variant: "rising", n: 26, n_unit: "weeks", when: null, effect_size: 0.2, metric_value: 0.02, unit: "hours per week",
  ci_low: -0.01, ci_high: 0.05, ci_null: 0, p_value: 0.3, p_adjusted: 0.4, outcome: "effect below the detector's minimum", ...o });

describe("weeklyLine", () => {
  it("runs from the first complete week to the last, a missing or partial week a gap, and labels each year once", () => {
    const line = weeklyLine([week(0, 4), week(1, 5, false), week(3, 6), week(2, 4.5, true, "CGH")], "SGH");
    expect(line.starts).toEqual([start(0), start(1), start(2), start(3)]);
    expect(line.values).toEqual([4, null, null, 6]);
    expect(line.labels).toEqual(["2024", "", "", "2025"]);          // the week of 30 Dec is still 2024
    expect(line.titles[0]).toBe("Week of 16 Dec 2024");
  });

  it("shades the last 26 weeks, or nothing for a shorter line", () => {
    const long = weeklyLine(Array.from({ length: 30 }, (_, k) => week(k, 4)), "SGH");
    expect(trendWindow(long)).toEqual({ from: 4, to: 29 });
    expect(trendWindow(weeklyLine([week(0, 4)], "SGH"))).toBeNull();
  });
});

describe("trendSentence", () => {
  it("says the engine's estimate and range, and what the test found, without a causal word", () => {
    expect(trendSentence(trend({}))).toBe("Over the shaded 26 weeks, the estimated change is +0.02 hours a week (95% range −0.01 to +0.05): too small to call a rise or a fall.");
    expect(trendSentence(trend({ outcome: "not significant after correction (adjusted p 0.5)" }))).toMatch(/can't tell a rise or fall from no change\.$/);
    expect(trendSentence(trend({ outcome: "published", metric_value: -0.1 }))).toMatch(/a clear fall, published as a finding\.$/);
    expect(trendSentence(trend({ metric_value: -0.003 }))).toContain("the estimated change is 0.00 hours a week");
    expect(trendSentence(undefined)).toBeNull();
    expect(trendSentence(trend({ metric_value: null }))).toBeNull();
  });
});

describe("zeroScale and scatterPoints", () => {
  it("holds every value and 0, with 0 a tick", () => {
    const s = zeroScale([-37, 12, 80]);
    expect(s.min).toBeLessThanOrEqual(-37);
    expect(s.max).toBeGreaterThanOrEqual(80);
    expect(s.ticks).toContain(0);
  });

  it("takes the engine's [date, x, y] pairs and drops a malformed one", () => {
    expect(scatterPoints({ pairs: [["2026-10-01", -20, -0.4], ["bad", "x", 1], ["2026-10-02", 3, 0.1]] }))
      .toEqual([{ date: "2026-10-01", x: -20, y: -0.4 }, { date: "2026-10-02", x: 3, y: 0.1 }]);
    expect(scatterPoints({ pairs: null })).toEqual([]);
  });
});
