/**
 * Month by month and year on year (the ED Trends monthly page and each hospital's page).
 *
 * The API gives each month's figures and its year-on-year and month-on-month change, only between two complete months
 * (marts.fct_ed_monthly). This file only lays them out: it picks the months to draw, pairs each month with the same month a
 * year earlier, and totals "the year so far" over the months both years have complete. Missing stays missing: a partial
 * month is a gap in a line, never a figure; a month without a comparison has no change, never 0%.
 */
import type { EdMonth, EdSystemMonth } from "./api/types";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

/** The two shapes the monthly API gives, read the same way. */
export interface Point {
  year: number;
  month: number;
  complete: boolean;
  wait: number | null;
  visits: number | null;
  waitYoy: number | null;
  visitsYoy: number | null;
  waitMom: number | null;
  visitsMom: number | null;
  /** "n of m hospitals complete" for the system series; null for one hospital. */
  note: string | null;
}

export const fromHospital = (r: EdMonth): Point => ({
  year: r.year, month: r.month, complete: r.is_complete_month,
  wait: r.mean_of_daily_median_wait_hours ?? null, visits: r.total_attendances ?? null,
  waitYoy: r.wait_yoy_pct ?? null, visitsYoy: r.attendances_yoy_pct ?? null,
  waitMom: r.wait_mom_pct ?? null, visitsMom: r.attendances_mom_pct ?? null,
  note: r.is_complete_month ? null : `${r.days_reported_wait} of ${r.days_in_month} days`,
});

export const fromSystem = (r: EdSystemMonth): Point => ({
  year: r.year, month: r.month, complete: r.is_complete_month,
  wait: r.mean_of_hospital_mean_wait_hours ?? null, visits: r.total_attendances ?? null,
  waitYoy: r.wait_yoy_pct ?? null, visitsYoy: r.attendances_yoy_pct ?? null,
  waitMom: r.wait_mom_pct ?? null, visitsMom: r.attendances_mom_pct ?? null,
  note: r.is_complete_month ? null : `${r.n_complete_hospitals} of ${r.n_hospitals} hospitals complete`,
});

const key = (p: Pick<Point, "year" | "month">) => p.year * 12 + p.month - 1;
export const sortPoints = (points: Point[]): Point[] => [...points].sort((a, b) => key(a) - key(b));

/** The newest month that is complete, or null. */
export function latestComplete(points: Point[]): Point | null {
  return sortPoints(points.filter((p) => p.complete && p.wait != null)).at(-1) ?? null;
}

export interface YearLine {
  year: number;
  /** January to December; null where the month is missing or partial. */
  values: (number | null)[];
}

/** One line per calendar year (the newest `max`), for "this year against last year" on the same Jan–Dec axis. */
export function yearLines(points: Point[], measure: "wait" | "visits", max = 3): YearLine[] {
  const years = [...new Set(points.map((p) => p.year))].sort((a, b) => a - b).slice(-max);
  return years.map((year) => ({
    year,
    values: MONTHS.map((_, i) => {
      const p = points.find((q) => q.year === year && q.month === i + 1);
      return p && p.complete ? p[measure] : null;
    }),
  }));
}

/** The whole series on one time axis, oldest first, as values for a line: partial months are null (a gap). */
export function timeSeries(points: Point[], measure: "wait" | "visits" | "waitYoy" | "visitsYoy"): { label: string; value: number | null }[] {
  return sortPoints(points).map((p) => ({ label: `${MONTHS[p.month - 1]} ${p.year}`, value: p.complete ? p[measure] : null }));
}

export interface YearSoFar {
  year: number;
  /** Months counted: those complete in this year and the one before. */
  months: number;
  wait: number;
  visits: number;
  /** Against the year before, over the same months; null for the first year or when no month is shared. */
  waitChangePct: number | null;
  visitsChangePct: number | null;
}

/**
 * Each year's average bed wait and total visits over the months up to the newest complete month, counting only the months that
 * are complete in every year shown, so two years are always compared over the same months. The average is of the monthly
 * averages (each month counts once). Null when fewer than one month is shared.
 */
export function yearsSoFar(points: Point[], years = 3): YearSoFar[] {
  const latest = latestComplete(points);
  if (!latest) return [];
  const done = (y: number, m: number) => points.find((p) => p.year === y && p.month === m && p.complete && p.wait != null && p.visits != null);
  const shown = Array.from({ length: years }, (_, i) => latest.year - years + 1 + i);
  const months = Array.from({ length: latest.month }, (_, i) => i + 1).filter((m) => shown.every((y) => done(y, m)));
  if (!months.length) return [];
  const total = (y: number) => {
    const ps = months.map((m) => done(y, m) as Point);
    return { wait: ps.reduce((s, p) => s + (p.wait as number), 0) / ps.length, visits: ps.reduce((s, p) => s + (p.visits as number), 0) };
  };
  return shown.map((year, i) => {
    const t = total(year);
    const before = i > 0 ? total((shown[i - 1] as number)) : null;
    return { year, months: months.length, ...t,
             waitChangePct: before && before.wait > 0 ? (t.wait / before.wait - 1) * 100 : null,
             visitsChangePct: before && before.visits > 0 ? (t.visits / before.visits - 1) * 100 : null };
  });
}

/** "Jan–Oct" for the months counted, or "Jan" for one. */
export function monthsText(n: number): string {
  return n <= 1 ? MONTHS[0] : `${MONTHS[0]}–${MONTHS[n - 1]}`;
}

const pct = (v: number) => `${Math.round(Math.abs(v)).toLocaleString("en-SG")}%`;
const hrs = (v: number) => v.toLocaleString("en-SG", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "4.4% lower than in October 2025" style phrase for a change; null change gives null (nothing said, never "0%"). */
export function changePhrase(change: number | null, then: string): string | null {
  if (change == null || !Number.isFinite(change)) return null;
  if (Math.round(change) === 0) return `about the same as ${then}`;
  return `${pct(change)} ${change > 0 ? "higher" : "lower"} than ${then}`;
}

/**
 * One plain sentence on the newest complete month: its average bed wait and how it compares with the same month a year
 * earlier. No cause is given or implied. Null when there is no complete month.
 */
export function monthLede(subject: string, points: Point[]): string | null {
  const m = latestComplete(points);
  if (!m || m.wait == null) return null;
  const name = `${MONTHS_LONG[m.month - 1]} ${m.year}`;
  const vs = changePhrase(m.waitYoy, `${MONTHS_LONG[m.month - 1]} ${m.year - 1}`);
  return `${subject}: the average bed wait in ${name} was ${hrs(m.wait)} hours${vs ? `, ${vs}` : ""}.`;
}

/**
 * How big a year-on-year change is, set against the same series: the middle |change| across every month that has one.
 * Null with fewer than 12 months to judge by (never a guess). `pct` is the change being described.
 */
export function yoyContext(points: Point[], pct: number): string | null {
  const swings = points.flatMap((p) => (p.complete && p.waitYoy != null ? [Math.abs(p.waitYoy)] : [])).sort((a, b) => a - b);
  if (swings.length < 12) return null;
  const mid = swings.length % 2 ? swings[(swings.length - 1) / 2]! : (swings[swings.length / 2 - 1]! + swings[swings.length / 2]!) / 2;
  const typical = Math.round(mid);
  return Math.abs(pct) <= mid
    ? `A change this size is within the usual swing between years: the typical month differs by about ${typical}%.`
    : `A change this size is larger than the usual swing between years: the typical month differs by about ${typical}%.`;
}

/** The year-on-year tile's word, so the sign is never the only cue (docs/language_rules.md, Rule 5). Rounds as the figure does. */
export function yoyWord(pct: number): string {
  const whole = Math.round(pct);
  return whole < 0 ? "shorter" : whole > 0 ? "longer" : "about the same";
}
