/**
 * Hospital x day coverage for the Data Quality page. A day is "missing" only when MOH was expected
 * to report the site: days before a site's reported_from (e.g. Woodlands before 23 Jun 2024) are
 * "not expected", not gaps.
 */
import type { EdDay, Hospital } from "./api/types";
import { eachDay } from "./series";

export type CellState = "both" | "wait_only" | "attendance_only" | "missing" | "not_expected";

export const CELL_LABELS: Record<CellState, string> = {
  both: "Both figures reported",
  wait_only: "Bed wait only (no attendances)",
  attendance_only: "Attendances only (no bed wait)",
  missing: "Missing",
  not_expected: "Not reported by MOH yet",
};

export interface CoverageRow {
  code: string;
  name: string;
  cells: CellState[];
  counts: Record<CellState, number>;
  /** Days with at least one figure missing, as ISO dates. */
  gaps: { date: string; state: CellState }[];
}

export function coverageGrid(rows: EdDay[], hospitals: Hospital[], from: string, to: string): { days: string[]; rows: CoverageRow[] } {
  const days = eachDay(from, to);
  const byKey = new Map(rows.map((r) => [`${r.hospital_code}|${r.report_date}`, r]));
  return {
    days,
    rows: hospitals.map((h) => {
      const counts: Record<CellState, number> = { both: 0, wait_only: 0, attendance_only: 0, missing: 0, not_expected: 0 };
      const gaps: CoverageRow["gaps"] = [];
      const cells = days.map((d): CellState => {
        let state: CellState;
        if (h.reported_from && d < h.reported_from) state = "not_expected";
        else {
          const r = byKey.get(`${h.hospital_code}|${d}`);
          const w = r?.median_wait_hours != null;
          const a = r?.attendances != null;
          state = w && a ? "both" : w ? "wait_only" : a ? "attendance_only" : "missing";
        }
        counts[state] += 1;
        if (state === "wait_only" || state === "attendance_only" || state === "missing") gaps.push({ date: d, state });
        return state;
      });
      return { code: h.hospital_code, name: h.hospital_name, cells, counts, gaps };
    }),
  };
}

/** "2026-10-07" style dates collapsed into runs: "7 Oct 2026", "1–5 Sep 2026". */
export function dateRuns(dates: string[]): string[] {
  const fmt = new Intl.DateTimeFormat("en-SG", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
  const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  const runs: [string, string][] = [];
  for (const d of [...dates].sort()) {
    const last = runs.at(-1);
    if (last && day(d) - day(last[1]) === 86_400_000) last[1] = d;
    else runs.push([d, d]);
  }
  return runs.map(([a, b]) => (a === b ? fmt.format(day(a)) : `${fmt.format(day(a))} – ${fmt.format(day(b))}`));
}

export const COVERAGE_WINDOWS = [13, 26, 52] as const;
export type CoverageWindow = (typeof COVERAGE_WINDOWS)[number];

export function parseWindow(v: string | string[] | undefined): CoverageWindow {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return (COVERAGE_WINDOWS as readonly number[]).includes(n) ? (n as CoverageWindow) : 13;
}

/** The window's first day: `weeks` whole weeks ending on `to` (inclusive). */
export function windowStart(to: string, weeks: number): string {
  return new Date(Date.parse(`${to}T00:00:00Z`) - (weeks * 7 - 1) * 86_400_000).toISOString().slice(0, 10);
}

/** GitHub-style heading anchor (as rehype-slug makes them), for linking a check to its section. */
export function slugify(heading: string): string {
  return heading.toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
}
