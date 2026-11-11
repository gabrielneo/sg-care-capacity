/**
 * The home page's hospital status: last week's bed wait against the hospital's own usual level.
 *
 * "Usual" is ED Trends' and the insight engine's usual level (lib/edCompare.ts, usualLevels): the
 * median of the 8 complete weeks before the latest complete week. The badge is a plain comparison,
 * not a tested finding (docs/data_dictionary.md, "Computed by the site"):
 *
 *   change vs usual       badge
 *   +30% or more          Much higher than usual
 *   +15% to under +30%    Higher than usual
 *   over -15% to +15%     About usual
 *   -15% or less          Lower than usual
 *   no usual level        No comparison (fewer than 8 complete weeks before the latest)
 *
 * Missing stays missing: no usual level means no badge colour, never "about usual".
 */
import type { EdWeek } from "./api/types";
import type { Usual } from "./edCompare";

export const HIGHER_PCT = 15;
export const MUCH_HIGHER_PCT = 30;
export const SPARK_WEEKS = 12;

export type Level = "much_higher" | "higher" | "usual" | "lower" | "unknown";

export interface LevelInfo {
  label: string;
  /** A shape as well as a colour, so the badge never depends on colour alone. */
  icon: string;
  tone: "bad" | "warn" | "ok" | "none";
  sentence: string;
}

export const LEVELS: Record<Level, LevelInfo> = {
  much_higher: { label: "Much higher than usual", icon: "▲▲", tone: "bad", sentence: "Bed waits were much longer than usual last week." },
  higher: { label: "Higher than usual", icon: "▲", tone: "warn", sentence: "Bed waits were longer than usual last week." },
  usual: { label: "About usual", icon: "●", tone: "ok", sentence: "Bed waits were about usual last week." },
  lower: { label: "Lower than usual", icon: "▼", tone: "ok", sentence: "Bed waits were shorter than usual last week." },
  unknown: { label: "No comparison", icon: "–", tone: "none", sentence: "Not enough complete weeks to compare with usual." },
};

export function levelFor(pct: number | null | undefined): Level {
  if (pct == null || !Number.isFinite(pct)) return "unknown";
  if (pct >= MUCH_HIGHER_PCT) return "much_higher";
  if (pct >= HIGHER_PCT) return "higher";
  if (pct <= -HIGHER_PCT) return "lower";
  return "usual";
}

export interface HospitalStatus {
  code: string;
  level: Level;
  /** Last complete week's average of daily medians, hours; null if that week isn't complete here. */
  latest: number | null;
  usual: number | null;
  pct: number | null;
  /** The last SPARK_WEEKS weeks, oldest first; null for a week that isn't complete. */
  spark: (number | null)[];
}

const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** The SPARK_WEEKS week starts ending at the latest complete week, oldest first. */
export function sparkWeeks(latestWeek: string): string[] {
  return Array.from({ length: SPARK_WEEKS }, (_, k) => addDays(latestWeek, -7 * (SPARK_WEEKS - 1 - k)));
}

export function hospitalStatus(code: string, usual: Usual | undefined, weekly: EdWeek[], latestWeek: string | null): HospitalStatus {
  const pct = usual?.pct ?? null;
  const spark = latestWeek
    ? sparkWeeks(latestWeek).map((start) => {
        const w = weekly.find((r) => r.hospital_code === code && r.week_start === start);
        return w?.is_complete_week && w.mean_of_daily_median_wait_hours != null ? w.mean_of_daily_median_wait_hours : null;
      })
    : [];
  return { code, level: levelFor(pct), latest: usual?.latest ?? null, usual: usual?.usual ?? null, pct, spark };
}

/** Busiest first, so the hospitals to avoid lead; ties (and no comparison) by code. */
export function byPressure(a: HospitalStatus, b: HospitalStatus): number {
  const rank = (s: HospitalStatus) => (s.pct == null ? -Infinity : s.pct);
  return rank(b) - rank(a) || a.code.localeCompare(b.code);
}

/** The order a tally reads in: most pressure first, "no comparison" last. */
export const LEVEL_ORDER: readonly Level[] = ["much_higher", "higher", "usual", "lower", "unknown"];

/**
 * How many hospitals carry each badge: a count of the badges already shown, nothing more
 * (docs/data_dictionary.md, "Computed by the site"). Every level is present, 0 if no hospital has it.
 */
export function levelCounts(statuses: HospitalStatus[]): Record<Level, number> {
  const counts: Record<Level, number> = { much_higher: 0, higher: 0, usual: 0, lower: 0, unknown: 0 };
  for (const s of statuses) counts[s.level] += 1;
  return counts;
}

/**
 * A sparkline as SVG path data: one sub-path per run of known values, so a missing week is a gap,
 * never a line drawn through it. y is flipped (higher value = higher on screen).
 */
export function sparkPath(values: (number | null)[], width: number, height: number, pad = 2): string {
  const known = values.filter((v): v is number => v != null);
  if (!known.length || values.length < 2) return "";
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  const span = hi - lo || 1;
  const x = (i: number) => pad + (i * (width - 2 * pad)) / (values.length - 1);
  const y = (v: number) => height - pad - ((v - lo) / span) * (height - 2 * pad);
  let d = "";
  let open = false;
  values.forEach((v, i) => {
    if (v == null) {
      open = false;
      return;
    }
    d += `${open ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    open = true;
  });
  return d;
}
