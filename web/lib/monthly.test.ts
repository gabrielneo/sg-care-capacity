import { describe, expect, it } from "vitest";

import { changePhrase, fromHospital, fromSystem, latestComplete, monthLede, monthsText, type Point, timeSeries, yearLines, yearsSoFar, yoyWord } from "./monthly";

const pt = (year: number, month: number, wait: number | null, visits: number | null, o: Partial<Point> = {}): Point =>
  ({ year, month, complete: true, wait, visits, waitYoy: null, visitsYoy: null, waitMom: null, visitsMom: null, note: null, ...o });

/** Three Januaries to Marches: waits 8, 6, 5 (each month's value equal within a year); visits 100, 100, 110; Mar 2026 partial. */
const series: Point[] = [
  ...[1, 2, 3].map((m) => pt(2024, m, 8, 100)),
  ...[1, 2, 3].map((m) => pt(2025, m, 6, 100)),
  pt(2026, 1, 5, 110), pt(2026, 2, 5, 110), pt(2026, 3, 99, 50, { complete: false, note: "20 of 31 days" }),
];

describe("the latest complete month", () => {
  it("skips a partial month", () => expect(latestComplete(series)).toMatchObject({ year: 2026, month: 2 }));
  it("is null when nothing is complete", () => expect(latestComplete([pt(2026, 1, 5, 1, { complete: false })])).toBeNull());
});

describe("year lines", () => {
  it("one line per year, Jan to Dec, a partial or missing month a gap", () => {
    const lines = yearLines(series, "wait");
    expect(lines.map((l) => l.year)).toEqual([2024, 2025, 2026]);
    expect(lines[2]!.values.slice(0, 4)).toEqual([5, 5, null, null]);       // March 2026 is partial: no value, not 99
    expect(lines[0]!.values).toHaveLength(12);
  });
  it("keeps only the newest years", () => expect(yearLines(series, "wait", 2).map((l) => l.year)).toEqual([2025, 2026]));
});

describe("the whole series", () => {
  it("is in time order whatever order it came in, with partial months as gaps", () => {
    const s = timeSeries([...series].reverse(), "wait");
    expect(s[0]).toEqual({ label: "Jan 2024", value: 8 });
    expect(s.at(-1)).toEqual({ label: "Mar 2026", value: null });
  });
});

describe("the year so far", () => {
  it("compares years over the same complete months and says how many", () => {
    const rows = yearsSoFar(series);
    expect(rows.map((r) => [r.year, r.months, r.wait, r.visits])).toEqual([[2024, 2, 8, 200], [2025, 2, 6, 200], [2026, 2, 5, 220]]);
    expect(rows[0]!.waitChangePct).toBeNull();                                 // the first year has nothing before it
    expect(rows[1]!.waitChangePct).toBeCloseTo(-25, 6);
    expect(rows[2]!.waitChangePct).toBeCloseTo((5 / 6 - 1) * 100, 6);
    expect(rows[2]!.visitsChangePct).toBeCloseTo(10, 6);
  });
  it("leaves out a month that is partial in any year shown", () => {
    const gap = series.map((p) => (p.year === 2025 && p.month === 1 ? { ...p, complete: false } : p));
    expect(yearsSoFar(gap)[0]!.months).toBe(1);                                // only February is complete in all three
  });
  it("gives nothing when no month is complete in every year", () => {
    expect(yearsSoFar(series.filter((p) => p.year !== 2025))).toEqual([]);
  });
  it("names the months in words", () => {
    expect(monthsText(10)).toBe("Jan–Oct");
    expect(monthsText(1)).toBe("Jan");
  });
});

describe("a change in words", () => {
  it.each([
    [-6.5, "7% lower than October 2025"], [33.4, "33% higher than October 2025"], [0.3, "about the same as October 2025"],
  ])("%s -> %s", (v, text) => expect(changePhrase(v, "October 2025")).toBe(text));
  it("no comparison, nothing said", () => {
    expect(changePhrase(null, "October 2025")).toBeNull();
    expect(changePhrase(Number.NaN, "October 2025")).toBeNull();
  });
  it("the lede states the newest complete month, with its year-on-year change, and no cause", () => {
    const text = monthLede("Across the 7 full EDs", series.map((p) => (p.year === 2026 && p.month === 2 ? { ...p, waitYoy: -16.7 } : p)))!;
    expect(text).toBe("Across the 7 full EDs: the average bed wait in February 2026 was 5.0 hours, 17% lower than February 2025.");
    expect(text).not.toMatch(/\b(caus|because|due to|driv|lead)/i);
    expect(monthLede("x", [])).toBeNull();
  });
  it("without a year-on-year figure the lede gives the wait alone", () => {
    expect(monthLede("SGH", [pt(2026, 1, 4.25, 10)])).toBe("SGH: the average bed wait in January 2026 was 4.3 hours.");
  });
});

describe("reading the API rows", () => {
  it("a hospital's partial month says how many days it has", () => {
    const p = fromHospital({ hospital_code: "AH", hospital_name: "A", year: 2026, month: 10, month_start: "2026-10-01", mean_of_daily_median_wait_hours: 1.5,
      total_attendances: 700, days_reported_wait: 30, days_reported_attendances: 30, days_in_month: 31, is_complete_month: false, wait_yoy_pct: null,
      attendances_yoy_pct: null, wait_mom_pct: null, attendances_mom_pct: null, source_sha256: null, as_of: "2026-11-01T00:00:00", as_of_basis: "fetched" });
    expect(p.note).toBe("30 of 31 days");
    expect(p.waitYoy).toBeNull();
  });
  it("a system month says how many hospitals are complete", () => {
    const p = fromSystem({ year: 2026, month: 10, month_start: "2026-10-01", n_hospitals: 7, n_complete_hospitals: 5, is_complete_month: false,
      mean_of_hospital_mean_wait_hours: null, total_attendances: null, wait_yoy_pct: null, attendances_yoy_pct: null, wait_mom_pct: null,
      attendances_mom_pct: null, source_sha256: null, as_of: "2026-11-01T00:00:00", as_of_basis: "fetched" });
    expect(p).toMatchObject({ complete: false, wait: null, note: "5 of 7 hospitals complete" });
  });
});

describe("yoyWord", () => {
  it("names the direction the rounded figure shows", () => {
    expect(yoyWord(-6.46)).toBe("shorter");
    expect(yoyWord(19.1)).toBe("longer");
    expect(yoyWord(0.4)).toBe("about the same");
  });
});
