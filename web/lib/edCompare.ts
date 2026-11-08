/**
 * Difference-first views of the MOH bed-wait figures (ED Trends). Each hospital is compared with
 * itself first ("vs own usual level"); raw values across hospitals are a second view. Definitions
 * match the insight engine's, so a chart and its finding agree (docs/insights_method.md):
 *
 * - Usual level: the median of the 8 complete weeks before the latest complete week (each week the
 *   average of its daily medians). As the unusual-week finding: all 8 weeks are needed, or none.
 * - Weekday profile: each weekday's average of daily medians as % above or below the hospital's
 *   own average, over the 26 complete weeks up to the latest complete week. As the peak-day finding.
 * - The all-hospital band: the middle half (25th to 75th percentile) of the full EDs each day, and
 *   their median. Alexandra Hospital is left out: it is an urgent care centre.
 *
 * Missing stays missing: a hospital without enough complete weeks gets no usual level, a day
 * without a figure is a gap, never a guess.
 */
import type { EdDay, EdWeek, Hospital, Insight, LiveReading } from "./api/types";
import { divergingScale, mapScale } from "./palette";

export const USUAL_WEEKS = 8;
export const PROFILE_WEEKS = 26;
/** A weekday profile from fewer complete weeks than this is too thin to show. */
export const PROFILE_MIN_WEEKS = 4;
export const BAND_MIN_HOSPITALS = 3;

export type Mode = "usual" | "raw";
export const parseMode = (v: string | string[] | undefined): Mode => ((Array.isArray(v) ? v[0] : v) === "raw" ? "raw" : "usual");

const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** The full EDs: everything but the urgent care centre (the band and raw comparisons need like with like). */
export const fullEds = (hospitals: Hospital[]) => hospitals.filter((h) => h.facility_type !== "UCC").map((h) => h.hospital_code);

/** The latest week every chart is anchored to: the newest complete ISO week of any hospital. */
export function latestCompleteWeek(weekly: EdWeek[]): string | null {
  const starts = weekly.filter((w) => w.is_complete_week && w.mean_of_daily_median_wait_hours != null).map((w) => w.week_start).sort();
  return starts.at(-1) ?? null;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/** Linear-interpolation quantile (the usual "type 7"), of an unsorted list. */
export function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return (s[lo] as number) + ((s[hi] as number) - (s[lo] as number)) * (pos - lo);
}

export interface Usual {
  code: string;
  /** Median of the 8 complete weeks before the latest; null unless all 8 are complete. */
  usual: number | null;
  /** The latest complete week's value; null if that week isn't complete for this hospital. */
  latest: number | null;
  diff: number | null;
  pct: number | null;
  /** Complete weeks found among the 8 before the latest. */
  weeks: number;
}

export function usualLevels(weekly: EdWeek[], codes: string[], latestWeek: string | null): Record<string, Usual> {
  const trailing = latestWeek ? Array.from({ length: USUAL_WEEKS }, (_, k) => addDays(latestWeek, -7 * (USUAL_WEEKS - k))) : [];
  const value = (code: string, start: string) => {
    const w = weekly.find((r) => r.hospital_code === code && r.week_start === start);
    return w?.is_complete_week && w.mean_of_daily_median_wait_hours != null ? w.mean_of_daily_median_wait_hours : null;
  };
  return Object.fromEntries(codes.map((code) => {
    const before = trailing.map((s) => value(code, s)).filter((v): v is number => v != null);
    const usual = before.length === USUAL_WEEKS ? median(before) : null;
    const latest = latestWeek ? value(code, latestWeek) : null;
    const diff = usual != null && latest != null ? latest - usual : null;
    return [code, { code, usual, latest, diff, pct: diff != null && usual ? (diff / usual) * 100 : null, weeks: before.length }];
  }));
}

export interface DayValue {
  date: string;
  value: number | null;
}

/** One hospital's daily series: hours, or hours above (+) or below (−) its usual level. */
export function hospitalSeries(daily: EdDay[], code: string, days: string[], mode: Mode, usual: number | null): DayValue[] {
  const byDate = new Map(daily.filter((r) => r.hospital_code === code).map((r) => [r.report_date, r.median_wait_hours]));
  return days.map((date) => {
    const v = byDate.get(date) ?? null;
    return { date, value: v == null ? null : mode === "raw" ? v : usual == null ? null : v - usual };
  });
}

export interface BandPoint {
  date: string;
  p25: number | null;
  p50: number | null;
  p75: number | null;
}

/** The full EDs' middle half each day, in the same mode as the panels; a gap with fewer than 3. */
export function band(daily: EdDay[], codes: string[], days: string[], mode: Mode, usuals: Record<string, Usual>): BandPoint[] {
  const series = codes.map((c) => hospitalSeries(daily, c, days, mode, usuals[c]?.usual ?? null));
  return days.map((date, i) => {
    const vals = series.map((s) => s[i]?.value).filter((v): v is number => v != null);
    if (vals.length < BAND_MIN_HOSPITALS) return { date, p25: null, p50: null, p75: null };
    return { date, p25: quantile(vals, 0.25), p50: quantile(vals, 0.5), p75: quantile(vals, 0.75) };
  });
}

export interface Profile {
  code: string;
  /** Monday first: % vs own average ("usual" mode) or hours ("raw"). Null: no figure that weekday. */
  values: (number | null)[];
  weeks: number;
}

/** The weekday profile over the complete weeks in [from, to]; null when too thin to show. */
export function weekdayProfile(daily: EdDay[], code: string, from: string, to: string, mode: Mode): Profile | null {
  const rows = daily.filter((r) => r.hospital_code === code && r.is_complete_week && r.median_wait_hours != null
    && r.report_date >= from && r.report_date <= to);
  const weeks = new Set(rows.map((r) => `${r.iso_year}-${r.iso_week}`)).size;
  if (weeks < PROFILE_MIN_WEEKS) return null;
  const mean = rows.reduce((s, r) => s + (r.median_wait_hours as number), 0) / rows.length;
  const values = Array.from({ length: 7 }, (_, d) => {
    const day = rows.filter((r) => (new Date(`${r.report_date}T00:00:00Z`).getUTCDay() + 6) % 7 === d).map((r) => r.median_wait_hours as number);
    if (!day.length) return null;
    const m = day.reduce((s, v) => s + v, 0) / day.length;
    return mode === "raw" ? m : (m / mean - 1) * 100;
  });
  return { code, values, weeks };
}

/** The profile window: the 26 complete weeks up to and including the latest complete week. */
export function profileWindow(latestWeek: string): { from: string; to: string } {
  return { from: addDays(latestWeek, -7 * (PROFILE_WEEKS - 1)), to: addDays(latestWeek, 6) };
}

// ------------------------------------------------------------------ colour scales

export interface ColourClass {
  min: number;
  max: number;
  color: string;
}

/**
 * Seven classes of equal width, symmetric about 0 from −m to +m, where m is the largest distance
 * from 0 (rounded up to a whole number): the middle class runs from −m/7 to +m/7, centred on 0.
 */
export function divergingClasses(values: (number | null)[]): ColourClass[] {
  const m = Math.max(1, Math.ceil(Math.max(0, ...values.filter((v): v is number => v != null).map(Math.abs))));
  const w = (2 * m) / divergingScale.length;
  return divergingScale.map((color, i) => ({ min: -m + i * w, max: -m + (i + 1) * w, color }));
}

/** Five classes of equal width from the lowest to the highest value; darker = longer. */
export function sequentialClasses(values: (number | null)[]): ColourClass[] {
  const v = values.filter((x): x is number => x != null);
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const w = (hi - lo || 1) / mapScale.length;
  return mapScale.map((color, i) => ({ min: lo + i * w, max: lo + (i + 1) * w, color }));
}

export function classFor(v: number, classes: ColourClass[]): ColourClass {
  return classes.find((c, i) => v < c.max || i === classes.length - 1) as ColourClass;
}

/** Light or dark text for a cell, matching the contrast pairs tested in palette.ts. */
export function textOn(color: string): "light" | "dark" {
  const dark = [divergingScale[0], divergingScale[6], mapScale[3], mapScale[4]] as string[];
  return dark.includes(color) ? "light" : "dark";
}

// ------------------------------------------------------------------ NUHS vs MOH

export interface SlopePair {
  code: string;
  moh: { value: number; date: string } | null;
  /** bound: "<" or ">" when NUHS gave a bound ("< 1 hour"), not a value. Such a reading is never drawn as a point. */
  nuhs: { value: number; at: string; bound: "<" | ">" | null } | null;
}

/** Each NUHS site's latest adult ED estimate, beside MOH's latest daily figure for that hospital. */
export function slopePairs(daily: EdDay[], live: LiveReading[]): SlopePair[] {
  const codes = [...new Set(live.filter((r) => r.hospital_code && r.is_adult_ed !== false).map((r) => r.hospital_code as string))].sort();
  return codes.map((code) => {
    const est = live.filter((r) => r.hospital_code === code && r.is_adult_ed !== false && r.est_bed_wait_hours != null)
      .sort((a, b) => b.snapshot_at.localeCompare(a.snapshot_at))[0];
    const moh = daily.filter((r) => r.hospital_code === code && r.median_wait_hours != null)
      .sort((a, b) => b.report_date.localeCompare(a.report_date))[0];
    return { code, nuhs: est ? { value: est.est_bed_wait_hours as number, at: est.snapshot_at, bound: est.est_bed_wait_qualifier ?? null } : null,
             moh: moh ? { value: moh.median_wait_hours as number, date: moh.report_date } : null };
  });
}

// ------------------------------------------------------------------ annotations

/**
 * The finding a chart annotates: the highest-ranked published insight of that type, if any, in the
 * engine's own order (rank score, then the size of the effect; scores are capped at 1, so ties happen).
 */
export function findingFor(insights: Insight[], type: Insight["type"]): Insight | null {
  return insights.filter((i) => i.type === type && i.chart)
    .sort((a, b) => b.rank_score - a.rank_score || Math.abs(b.effect_size ?? 0) - Math.abs(a.effect_size ?? 0)
      || a.insight_id.localeCompare(b.insight_id))[0] ?? null;
}

/** The weekday a weekday finding highlights (its chart's highlighted key: "mon".."sun"), Monday = 0. */
export function findingWeekday(insight: Insight | null): number | null {
  const key = insight?.chart?.highlight[0];
  const i = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].indexOf(key ?? "");
  return i === -1 ? null : i;
}
