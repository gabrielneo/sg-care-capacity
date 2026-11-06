import { describe, expect, it } from "vitest";

import type { EdSummary } from "./api/types";
import { formatWeek, summaryParagraph, weekKpis } from "./summary";

const WEEK = { iso_year: 2026, iso_week: 43, week_start: "2026-10-19", week_end: "2026-10-25" };

function row(code: string, name: string, wait: number | null, base: number | null, att: number | null,
             attBase: number | null, opts: Partial<EdSummary> = {}): EdSummary {
  const change = (v: number | null, b: number | null) => (v == null || b == null ? null : v - b);
  const pct = (v: number | null, b: number | null) => (v == null || b == null || b === 0 ? null : ((v - b) / b) * 100);
  return {
    hospital_code: code, hospital_name: name, facility_type: code === "AH" ? "UCC" : "ED",
    latest_complete_week: WEEK, is_current: true, baseline_weeks: base == null ? [] : ["2026-09-21"],
    mean_of_daily_median_wait_hours: { unit: "hours", latest: wait, baseline_mean: base, change: change(wait, base), change_pct: pct(wait, base) },
    total_attendances: { unit: "patients", latest: att, baseline_mean: attBase, change: change(att, attBase), change_pct: pct(att, attBase) },
    note: null, ...opts,
  };
}

const ROWS: EdSummary[] = [
  row("AH", "Alexandra Hospital (UCC)", 2.14, 1.55, 1100, 1061),
  row("SGH", "Singapore General Hospital", 7.82, 8.29, 3400, 3510),
  row("CGH", "Changi General Hospital", 3.43, 3.57, 3600, 3541),
  row("NUH", "National University Hospital", null, null, null, null,
      { latest_complete_week: null, is_current: false, note: "No complete week" }),
];

describe("weekKpis", () => {
  it("uses the newest complete week and the hospitals on it", () => {
    const k = weekKpis(ROWS);
    expect(k.week).toEqual({ week_start: "2026-10-19", week_end: "2026-10-25" });
    expect(k.current.map((h) => h.code)).toEqual(["AH", "SGH", "CGH"]);
    expect(k.missing).toEqual([{ code: "NUH", name: "National University Hospital" }]);
  });

  it("totals attendances only across hospitals with the week, and compares like with like", () => {
    const a = weekKpis(ROWS).attendances;
    expect(a).toMatchObject({ total: 8100, baseline: 8112, hospitals: 3 });
    expect(a.changePct).toBeCloseTo(-0.148, 2);
  });

  it("drops the attendance comparison if any counted hospital lacks a baseline", () => {
    const k = weekKpis([...ROWS.slice(0, 2), row("CGH", "Changi General Hospital", 3.4, null, 3600, null)]);
    expect(k.attendances).toMatchObject({ total: 8100, baseline: null, changePct: null });
  });

  it("counts hospitals above their 4-week average among those that have one", () => {
    expect(weekKpis(ROWS).above).toEqual({ count: 1, outOf: 3, codes: ["AH"] });
  });
});

describe("summaryParagraph", () => {
  it("states the range, the comparison, the total and who is missing", () => {
    expect(summaryParagraph(weekKpis(ROWS))).toBe(
      "In the week of 19–25 Oct 2026, the average of daily median waits for a ward bed ranged from 2.1 hours at " +
      "Alexandra Hospital (an urgent care centre) to 7.8 hours at Singapore General Hospital. " +
      "1 of 3 hospitals was above its previous 4-week average. " +
      "Together the 3 hospitals recorded 8,100 attendances, about the same as the 4-week average. " +
      "National University Hospital has no complete data for that week and is left out.");
  });

  it("says more or fewer, and handles none above", () => {
    const rows = [row("SGH", "Singapore General Hospital", 7, 8, 3000, 3600), row("CGH", "Changi General Hospital", 3, 4, 3000, 3000)];
    const text = summaryParagraph(weekKpis(rows));
    expect(text).toContain("None of the 2 hospitals with a comparison was above its previous 4-week average.");
    expect(text).toContain("recorded 6,000 attendances, 9.1% fewer than the 4-week average.");
  });

  it("never invents a figure when there is no complete week", () => {
    expect(summaryParagraph(weekKpis([ROWS[3]!]))).toBe(
      "No hospital has a complete week of MOH data in this snapshot yet, so there is nothing to summarise.");
  });

  it("says when nothing can be compared", () => {
    const text = summaryParagraph(weekKpis([row("SGH", "Singapore General Hospital", 7, null, 3000, null)]));
    expect(text).toContain("was 7.0 hours at Singapore General Hospital.");
    expect(text).toContain("No hospital had four complete earlier weeks to compare with.");
    expect(text).toContain("It recorded 3,000 attendances.");
  });
});

describe("formatWeek", () => {
  it.each([
    [{ week_start: "2026-10-19", week_end: "2026-10-25" }, "19–25 Oct 2026"],
    [{ week_start: "2026-10-26", week_end: "2026-11-01" }, "26 Oct – 1 Nov 2026"],
    [{ week_start: "2025-12-29", week_end: "2026-01-04" }, "29 Dec 2025 – 4 Jan 2026"],
  ])("%o -> %s", (week, text) => expect(formatWeek(week)).toBe(text));
});
