import { describe, expect, it } from "vitest";

import type { EdWeek } from "./api/types";
import { usualLevels } from "./edCompare";
import { hospitalStatus } from "./status";
import { weekChanges } from "./weekChanges";

const DAY = 86_400_000;
const start = (i: number) => new Date(Date.parse("2026-08-31T00:00:00Z") + i * 7 * DAY).toISOString().slice(0, 10);

/** One hospital, weeks 0..n-1, each with the given hours (null = the week isn't complete). */
function series(code: string, hours: (number | null)[]): EdWeek[] {
  return hours.map((h, i) => ({ hospital_code: code, week_start: start(i), is_complete_week: h != null,
    mean_of_daily_median_wait_hours: h }) as EdWeek);
}

function run(weekly: EdWeek[], codes: string[], latest: string) {
  const usual = usualLevels(weekly, codes, latest);
  const current = codes.map((c) => hospitalStatus(c, usual[c], weekly, latest));
  return weekChanges(weekly, codes, latest, current);
}

// 8 weeks at 4.0 h, then a 4.0 week (index 8), then the latest week (index 9).
const flat = Array<number>(9).fill(4);

describe("weekChanges", () => {
  it("lists a hospital whose badge moved, and counts the rest as unchanged", () => {
    const weekly = [...series("AAA", [...flat, 6.0]), ...series("BBB", [...flat, 4.1])];
    const r = run(weekly, ["AAA", "BBB"], start(9));
    expect(r.previousWeek).toBe(start(8));
    expect(r.moved).toEqual([{ code: "AAA", from: "usual", to: "much_higher", step: 2 }]);
    expect(r.unchanged).toBe(1);
    expect(r.notCompared).toBe(0);
  });

  it("is empty when nothing moved", () => {
    const r = run(series("AAA", [...flat, 4.0]), ["AAA"], start(9));
    expect(r.moved).toEqual([]);
    expect(r.unchanged).toBe(1);
  });

  it("never treats a missing comparison as unchanged", () => {
    // Only 8 complete weeks in total: the latest week has a usual level, the week before has fewer than 8 weeks behind it.
    const r = run(series("AAA", [4, 4, 4, 4, 4, 4, 4, 4, 5]), ["AAA"], start(8));
    expect(r.moved).toEqual([]);
    expect(r.unchanged).toBe(0);
    expect(r.notCompared).toBe(1);
  });

  it("has nothing to compare without a latest week", () => {
    expect(weekChanges([], ["AAA"], null, [])).toEqual({ previousWeek: null, moved: [], unchanged: 0, notCompared: 1 });
  });

  it("puts the biggest move first", () => {
    const weekly = [...series("AAA", [...flat, 4.8]), ...series("BBB", [...flat, 3.0]), ...series("CCC", [...flat, 6.0])];
    const r = run(weekly, ["AAA", "BBB", "CCC"], start(9));
    expect(r.moved.map((m) => m.code)).toEqual(["CCC", "AAA", "BBB"]);
  });
});
