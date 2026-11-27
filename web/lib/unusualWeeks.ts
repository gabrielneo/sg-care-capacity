/**
 * Every past week, judged the way the status badge judges the latest one (lib/edCompare.ts usualLevels, lib/status.ts levelFor):
 * the week against the hospital's own previous 26 complete weeks (robust z-score), or, before a hospital has 20 of them, the older
 * rule (15% above usual and outside the 8 weeks before). The same code decides, so the timeline and the badge can't disagree.
 * Presentation only: it computes no new statistic.
 */
import type { EdWeek, Hospital } from "./api/types";
import { usualLevels } from "./edCompare";
import { type Level, levelFor } from "./status";
import { RANGE_WEEKS } from "./windows";

export interface WeekRow {
  code: string;
  /** One per week in `weeks`; "unknown" where the week isn't complete or has too little history to compare. */
  levels: Level[];
  /** Whether each week was judged by the 26-week rule (true) or the older rule (false); null where unknown. */
  byZ: (boolean | null)[];
}

export interface WeekGrid {
  weeks: string[];
  rows: WeekRow[];
}

/** The complete weeks of every hospital, oldest first, judged one by one. */
export function weekGrid(weekly: EdWeek[], hospitals: Pick<Hospital, "hospital_code">[]): WeekGrid {
  const complete = (w: EdWeek) => w.is_complete_week && w.mean_of_daily_median_wait_hours != null;
  const weeks = [...new Set(weekly.filter(complete).map((w) => w.week_start))].sort();
  const rows = hospitals.map(({ hospital_code: code }) => {
    const own = weekly.filter((w) => w.hospital_code === code);           // one hospital's rows: keeps each lookup short
    const have = new Set(own.filter(complete).map((w) => w.week_start));
    const judged = weeks.map((week) => {
      if (!have.has(week)) return { level: "unknown" as Level, byZ: null };
      const u = usualLevels(own, [code], week)[code];
      const level = levelFor(u?.pct, u?.position, u?.z);
      return { level, byZ: level === "unknown" ? null : u?.z != null };
    });
    return { code, levels: judged.map((j) => j.level), byZ: judged.map((j) => j.byZ) };
  });
  return { weeks, rows };
}

export interface WeekTally {
  /** Hospital-weeks judged by the 26-week rule. */
  judged: number;
  higher: number;
  muchHigher: number;
  lower: number;
}

/** How often the 26-week rule marked a week, over the rows given: the methodology's "about 5% higher, 1.5% much higher, 1% lower". */
export function weekTally(rows: WeekRow[]): WeekTally {
  const t = { judged: 0, higher: 0, muchHigher: 0, lower: 0 };
  for (const r of rows) {
    r.levels.forEach((level, i) => {
      if (!r.byZ[i]) return;
      t.judged += 1;
      if (level === "much_higher") { t.muchHigher += 1; t.higher += 1; }
      else if (level === "higher") t.higher += 1;
      else if (level === "lower") t.lower += 1;
    });
  }
  return t;
}

const pct = (n: number, d: number) => `${((100 * n) / d).toLocaleString("en-SG", { maximumFractionDigits: 1 })}%`;

/** One sentence: how often a week was marked, by the badge's own rule. */
export function tallySentence(t: WeekTally): string | null {
  if (!t.judged) return null;
  return `Of ${t.judged.toLocaleString("en-SG")} hospital-weeks with enough history for the ${RANGE_WEEKS}-week rule, ${pct(t.higher, t.judged)} were ` +
    `higher than usual (${pct(t.muchHigher, t.judged)} much higher) and ${pct(t.lower, t.judged)} lower.`;
}
