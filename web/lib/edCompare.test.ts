import { describe, expect, it } from "vitest";

import type { EdDay, EdWeek, Hospital, Insight, LiveReading } from "./api/types";
import {
  band,
  classFor,
  divergingClasses,
  findingFor,
  findingWeekday,
  fullEds,
  hospitalSeries,
  latestCompleteWeek,
  parseMode,
  coversWindow,
  profileFetchFrom,
  profileWindow,
  quantile,
  sequentialClasses,
  slopePairs,
  usualLevels,
  weekdayProfile,
} from "./edCompare";
import { divergingScale } from "./palette";

const week = (code: string, start: string, v: number | null, complete = true): EdWeek => ({
  hospital_code: code, hospital_name: code, iso_year: 2026, iso_week: 0, week_start: start, week_end: start,
  mean_of_daily_median_wait_hours: v, total_attendances: null, days_reported_wait: 7, days_reported_attendances: 7,
  is_complete_week: complete, source_sha256: "x", as_of: "2026-10-31", as_of_basis: "fetched",
});
const day = (code: string, date: string, v: number | null, complete = true, isoWeek = 40): EdDay => ({
  hospital_code: code, hospital_name: code, report_date: date, iso_year: 2026, iso_week: isoWeek, median_wait_hours: v,
  attendances: 100, is_complete_week: complete, dq_flags: [], wait_source_url: null, attendance_source_url: null,
  wait_source_sha256: null, attendance_source_sha256: null, as_of: "2026-10-31", as_of_basis: "fetched",
});
const hospital = (code: string, facility_type: "ED" | "UCC" = "ED"): Hospital => ({
  hospital_code: code, hospital_name: code, cluster: "x", facility_type, reported_from: null, coverage_note: null,
  exclusions_note: null, source_url: "https://www.moh.gov.sg/", as_of: "2026-11-06", as_of_basis: "reference_checked" });

const STARTS = ["2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"];

describe("the usual level (as the unusual-week finding defines it)", () => {
  const AH = [1.3214, 1.1814, 1.23, 1.0457, 1.4257, 1.52, 1.78, 1.4743, 2.14];      // the real AH weeks behind the finding
  const weekly = [...STARTS.map((s, i) => week("AH", s, AH[i]!)), week("AH", "2026-10-26", 2.5, false),
                  ...STARTS.map((s, i) => week("SGH", s, 4, i !== 3))];

  it("anchors to the newest complete week of any hospital", () => {
    expect(latestCompleteWeek(weekly)).toBe("2026-10-19");
  });

  it("is the median of the 8 complete weeks before: AH's 2.1 hours against 1.4 usual", () => {
    const u = usualLevels(weekly, ["AH"], "2026-10-19").AH!;
    expect(u.usual).toBeCloseTo(1.3736, 3);                                        // the finding's comparison value
    expect(u.latest).toBe(2.14);
    expect(u.pct).toBeCloseTo((2.14 / (u.usual as number) - 1) * 100, 6);
  });

  it("needs all 8 weeks: with one incomplete there is no usual level, never a guess", () => {
    const u = usualLevels(weekly, ["SGH", "NUH"], "2026-10-19");
    expect(u.SGH).toMatchObject({ usual: null, diff: null, weeks: 7, latest: 4 });
    expect(u.NUH).toMatchObject({ usual: null, latest: null, weeks: 0 });
  });
});

describe("daily series and the band", () => {
  const days = ["2026-10-01", "2026-10-02", "2026-10-03"];
  const daily = [day("A", days[0]!, 4), day("A", days[2]!, 6), day("B", days[0]!, 5), day("B", days[1]!, 5), day("B", days[2]!, 7),
                 day("C", days[0]!, 9), day("C", days[1]!, 8), day("C", days[2]!, 10), day("U", days[0]!, 1)];

  it("raw hours, or hours against the usual level; a missing day stays null", () => {
    expect(hospitalSeries(daily, "A", days, "raw", 5).map((d) => d.value)).toEqual([4, null, 6]);
    expect(hospitalSeries(daily, "A", days, "usual", 5).map((d) => d.value)).toEqual([-1, null, 1]);
    expect(hospitalSeries(daily, "A", days, "usual", null).map((d) => d.value)).toEqual([null, null, null]);
  });

  it("the band is the middle half of the full EDs each day, a gap when fewer than 3 report", () => {
    const usuals = {} as Parameters<typeof band>[4];
    const b = band(daily, ["A", "B", "C"], days, "raw", usuals);
    expect(b[0]).toEqual({ date: days[0], p25: 4.5, p50: 5, p75: 7 });
    expect(b[1]).toEqual({ date: days[1], p25: null, p50: null, p75: null });     // only B and C that day
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
  });

  it("leaves the urgent care centre out of the full EDs", () => {
    expect(fullEds([hospital("A"), hospital("U", "UCC")])).toEqual(["A"]);
  });
});

describe("the weekday profile (as the peak-day finding defines it)", () => {
  // 4 complete weeks: Tuesdays 6 hours, every other day 3: the mean is 24/7, Tuesday is +75%.
  const rows: EdDay[] = [];
  for (let w = 0; w < 4; w++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(Date.UTC(2026, 8, 7 + w * 7 + d)).toISOString().slice(0, 10);   // Mondays from 7 Sep
      rows.push(day("SKH", date, d === 1 ? 6 : 3, true, 37 + w));
    }
  }

  it("is each weekday's mean against the hospital's own mean, complete weeks only", () => {
    const p = weekdayProfile([...rows, day("SKH", "2026-10-06", 50, false)], "SKH", "2026-09-07", "2026-10-25", "usual")!;
    expect(p.weeks).toBe(4);
    expect(p.values[1]).toBeCloseTo((6 / (24 / 7) - 1) * 100, 6);                 // the incomplete week's 50 is left out
    expect(p.values[0]).toBeCloseTo((3 / (24 / 7) - 1) * 100, 6);
    expect(weekdayProfile(rows, "SKH", "2026-09-07", "2026-10-25", "raw")!.values[1]).toBe(6);
  });

  it("is not shown from fewer than 4 complete weeks", () => {
    expect(weekdayProfile(rows.slice(0, 21), "SKH", "2026-09-07", "2026-10-25", "usual")).toBeNull();
  });

  it("covers the 26 weeks up to the latest complete week", () => {
    expect(profileWindow("2026-10-19")).toEqual({ from: "2026-04-27", to: "2026-10-25" });   // the finding's window
  });
});

describe("colour classes", () => {
  it("diverging: 7 equal classes symmetric about 0, the middle one centred on 0", () => {
    const c = divergingClasses([-12, 43, 5, null]);
    expect(c).toHaveLength(7);
    expect(c[0]!.min).toBe(-43);
    expect(c[6]!.max).toBe(43);
    expect((c[3]!.min + c[3]!.max) / 2).toBeCloseTo(0, 10);
    expect(classFor(0, c).color).toBe(divergingScale[3]);
    expect(classFor(43, c).color).toBe(divergingScale[6]);
    expect(classFor(-43, c).color).toBe(divergingScale[0]);
  });

  it("sequential: 5 equal classes from the lowest to the highest value", () => {
    const c = sequentialClasses([2, 12, null]);
    expect([c[0]!.min, c[4]!.max]).toEqual([2, 12]);
  });
});

describe("NUHS against MOH", () => {
  it("pairs each site's latest adult estimate with MOH's latest daily figure", () => {
    const live = [
      { hospital_code: "NUH", is_adult_ed: true, est_bed_wait_hours: 6.5, snapshot_at: "2026-11-01T12:00:00" },
      { hospital_code: "NUH", is_adult_ed: true, est_bed_wait_hours: 5.0, snapshot_at: "2026-10-30T12:00:00" },
      { hospital_code: "NUH", is_adult_ed: false, est_bed_wait_hours: 1.0, snapshot_at: "2026-11-01T12:00:00" },
    ] as LiveReading[];
    const daily = [day("NUH", "2026-10-30", 4.2), day("NUH", "2026-10-31", null)];
    expect(slopePairs(daily, live)).toEqual([
      { code: "NUH", nuhs: { value: 6.5, at: "2026-11-01T12:00:00", bound: null }, moh: { value: 4.2, date: "2026-10-30" } }]);
  });

  it("keeps NUHS's bound with the reading (\"< 1 hour\" is not 1 hour)", () => {
    const live = [{ hospital_code: "AH", is_adult_ed: true, est_bed_wait_hours: 1, est_bed_wait_qualifier: "<",
                    snapshot_at: "2026-11-08T22:00:44" }] as LiveReading[];
    expect(slopePairs([day("AH", "2026-10-31", 1.5)], live)[0]!.nuhs).toEqual({ value: 1, at: "2026-11-08T22:00:44", bound: "<" });
  });
});

describe("findings and the mode", () => {
  it("annotates with the highest-ranked finding of the chart's kind", () => {
    const f = (type: Insight["type"], entity: string, rank_score: number, key = "tue") =>
      ({ type, entity, rank_score, chart: { highlight: [key] } } as unknown as Insight);
    const insights = [f("weekday", "NUH", 0.3), f("weekday", "SKH", 1.0), f("anomaly", "AH", 0.5)];
    expect(findingFor(insights, "weekday")!.entity).toBe("SKH");
    expect(findingFor(insights, "trend")).toBeNull();
    expect(findingWeekday(findingFor(insights, "weekday"))).toBe(1);
  });

  it("breaks a tie in rank score by the size of the effect, as the engine ranks", () => {
    const tied = [{ type: "weekday", entity: "KTPH", rank_score: 1, effect_size: 0.412, insight_id: "a", chart: {} },
                  { type: "weekday", entity: "SKH", rank_score: 1, effect_size: 0.4945, insight_id: "b", chart: {} }] as unknown as Insight[];
    expect(findingFor(tied, "weekday")!.entity).toBe("SKH");
  });

  it("defaults to each hospital against its own usual level", () => {
    expect([parseMode(undefined), parseMode("raw"), parseMode("other"), parseMode(["raw"])]).toEqual(["usual", "raw", "usual", "raw"]);
  });
});

describe("the early daily fetch for the weekday profile", () => {
  it("covers the 26-week window while MOH is up to about 4 weeks behind", () => {
    const from = profileFetchFrom("2026-11-11");
    expect(coversWindow(from, profileWindow("2026-10-19"))).toBe(true);     // the real gap on 2026-11-11
    expect(coversWindow(from, profileWindow("2026-10-12"))).toBe(true);
  });

  it("says when it doesn't, so the page fetches the exact window instead", () => {
    const from = profileFetchFrom("2026-11-11");
    expect(coversWindow(from, profileWindow("2026-09-21"))).toBe(false);    // MOH 7 weeks behind
  });
});

