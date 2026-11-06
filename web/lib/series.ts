/** Chart-ready series from /ed/daily rows. Missing days become null (a gap), never 0 or a joined line. */
import type { EdDay } from "./api/types";

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export type WideRow = { date: string } & Record<string, number | null | string>;

/** One row per day in [from, to], one column per hospital code: the median wait, or null. */
export function dailyWide(rows: EdDay[], codes: string[], from: string, to: string, metric: "median_wait_hours" | "attendances" = "median_wait_hours"): WideRow[] {
  const byKey = new Map(rows.map((r) => [`${r.hospital_code}|${r.report_date}`, r]));
  return eachDay(from, to).map((date) => {
    const row: WideRow = { date };
    for (const c of codes) row[c] = (byKey.get(`${c}|${date}`)?.[metric] as number | null | undefined) ?? null;
    return row;
  });
}

/** Days in the range with no value for each hospital (absent rows and null values alike). */
export function missingDays(wide: WideRow[], codes: string[]): Record<string, number> {
  return Object.fromEntries(codes.map((c) => [c, wide.filter((r) => r[c] == null).length]));
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function weekday(isoDate: string): number {
  return (new Date(`${isoDate}T00:00:00Z`).getUTCDay() + 6) % 7;                // Monday = 0
}

export type WeekdayRow = { day: (typeof WEEKDAYS)[number] } & Record<string, number | null | string>;

/** Mean of the daily median waits for each weekday, per hospital, with the day counts (`{code}_n`). */
export function dayOfWeek(rows: EdDay[], codes: string[]): WeekdayRow[] {
  return WEEKDAYS.map((day, i) => {
    const row: WeekdayRow = { day };
    for (const c of codes) {
      const vals = rows.filter((r) => r.hospital_code === c && r.median_wait_hours != null && weekday(r.report_date) === i)
                       .map((r) => r.median_wait_hours as number);
      row[c] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
      row[`${c}_n`] = vals.length;
    }
    return row;
  });
}

export interface ScatterPoint {
  date: string;
  wait: number;
  attendances: number;
}

/** Days with both a wait and an attendance count, per hospital; `excluded` counts the rest. */
export function scatterPoints(rows: EdDay[], codes: string[]): { points: Record<string, ScatterPoint[]>; excluded: number } {
  const points: Record<string, ScatterPoint[]> = Object.fromEntries(codes.map((c) => [c, []]));
  let excluded = 0;
  for (const r of rows) {
    if (!codes.includes(r.hospital_code)) continue;
    if (r.median_wait_hours == null || r.attendances == null) {
      excluded += 1;
      continue;
    }
    points[r.hospital_code]?.push({ date: r.report_date, wait: r.median_wait_hours, attendances: r.attendances });
  }
  return { points, excluded };
}

const DAY_FMT = new Intl.DateTimeFormat("en-SG", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });

/** "Sat, 31 Oct 2026" for tooltips. */
export function formatDay(isoDate: string): string {
  return DAY_FMT.format(new Date(`${isoDate}T00:00:00Z`));
}
