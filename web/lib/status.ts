/**
 * The home page's hospital status: last week's bed wait against the hospital's own usual level.
 *
 * "Usual" is ED Trends' and the insight engine's usual level (lib/edCompare.ts, usualLevels): the
 * median of the 8 complete weeks before the latest complete week. The badge is a plain comparison,
 * not a tested finding (docs/data_dictionary.md, "Computed by the site"):
 *
 *   change vs usual       and the week is                          badge
 *   +30% or more          higher than all of the 8 weeks before    Much higher than usual
 *   +15% to under +30%    higher than all of the 8 weeks before    Higher than usual
 *   -15% or less          lower than all of the 8 weeks before     Lower than usual
 *   anything else                                                  About usual
 *   no usual level                                                 No comparison (fewer than 8 complete weeks before the latest)
 *
 * A week has to be clearly away from usual (15%) and also outside the range its hospital has shown in the 8 weeks before, so a
 * hospital whose weeks swing widely needs a bigger move than a steady one. Without the second test, 44% of hospital-weeks since
 * 2025 read as "usual" and CGH and SGH carried a badge in 83% of them; with it, 76% and 30%. (A first version used a robust z of 2;
 * it called Sengkang's week at 62% below its usual "about usual", because its swings were wide, though no week in the 8 before was so low.)
 *
 * Missing stays missing: no usual level means no badge colour, never "about usual".
 */
import type { EdWeek } from "./api/types";
import type { Usual } from "./edCompare";
import { SPARK_WEEKS } from "./windows";

export { SPARK_WEEKS };
export const HIGHER_PCT = 15;
export const MUCH_HIGHER_PCT = 30;

export type Level = "much_higher" | "higher" | "usual" | "lower" | "unknown";

export interface LevelInfo {
  label: string;
  /** A shape as well as a colour, so the badge never depends on colour alone. */
  icon: string;
  tone: "much" | "higher" | "usual" | "lower" | "none";
  sentence: string;
}

export const LEVELS: Record<Level, LevelInfo> = {
  much_higher: { label: "Much higher than usual", icon: "▲▲", tone: "much", sentence: "Bed waits were much longer than usual in the latest complete week." },
  higher: { label: "Higher than usual", icon: "▲", tone: "higher", sentence: "Bed waits were longer than usual in the latest complete week." },
  usual: { label: "About usual", icon: "▬", tone: "usual", sentence: "Bed waits were about usual in the latest complete week." },
  lower: { label: "Lower than usual", icon: "▼", tone: "lower", sentence: "Bed waits were shorter than usual in the latest complete week." },
  unknown: { label: "No comparison", icon: "–", tone: "none", sentence: "Not enough complete weeks to compare with usual." },
};

export function levelFor(pct: number | null | undefined, position: -1 | 0 | 1 | null | undefined = null): Level {
  if (pct == null || !Number.isFinite(pct)) return "unknown";
  // No position given (a caller with only a %): the % line alone decides.
  const above = position == null || position === 1;
  const below = position == null || position === -1;
  if (pct >= MUCH_HIGHER_PCT && above) return "much_higher";
  if (pct >= HIGHER_PCT && above) return "higher";
  if (pct <= -HIGHER_PCT && below) return "lower";
  return "usual";
}

export interface HospitalStatus {
  code: string;
  level: Level;
  /** Last complete week's average of daily medians, hours; null if that week isn't complete here. */
  latest: number | null;
  usual: number | null;
  pct: number | null;
  /** The lowest and highest of the 8 usual weeks (hours), for the usual band; absent where unknown. */
  low?: number | null;
  high?: number | null;
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
  return { code, level: levelFor(pct, usual?.position), latest: usual?.latest ?? null, usual: usual?.usual ?? null, pct,
           low: usual?.low ?? null, high: usual?.high ?? null, spark };
}

/** Largest change against usual first; no comparison last; ties by code. */
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

/** The value range a sparkline is drawn over: its known values, widened to hold `extra` (the usual band). Null without values. */
export function sparkDomain(values: (number | null)[], extra: number[] = []): [number, number] | null {
  const known = values.filter((v): v is number => v != null);
  if (!known.length) return null;
  const all = [...known, ...extra.filter((v) => Number.isFinite(v))];
  return [Math.min(...all), Math.max(...all)];
}

/** A value's y in a sparkline of this height (higher value = higher on screen). A flat range sits on the bottom edge. */
export function sparkY(v: number, [lo, hi]: [number, number], height: number, pad = 2): number {
  return height - pad - ((v - lo) / (hi - lo || 1)) * (height - 2 * pad);
}

/**
 * A sparkline as SVG path data: one sub-path per run of known values, so a missing week is a gap,
 * never a line drawn through it. y is flipped (higher value = higher on screen). `domain` is the
 * value range to draw over, when something else (the usual band) shares the scale.
 */
export function sparkPath(values: (number | null)[], width: number, height: number, pad = 2,
                          domain: [number, number] | null = sparkDomain(values)): string {
  if (!domain || values.length < 2) return "";
  const x = (i: number) => pad + (i * (width - 2 * pad)) / (values.length - 1);
  let d = "";
  let open = false;
  values.forEach((v, i) => {
    if (v == null) {
      open = false;
      return;
    }
    d += `${open ? "L" : "M"}${x(i).toFixed(1)} ${sparkY(v, domain, height, pad).toFixed(1)}`;
    open = true;
  });
  return d;
}

/**
 * The "about usual" zone around a usual level. A week leaves it, and so earns a badge, only when it is both HIGHER_PCT away and
 * outside the range of the 8 weeks before, so each side is the wider of the two. No usual level, no band; no range known, the % line alone.
 */
export function usualBand(usual: number | null | undefined, low: number | null | undefined = null, high: number | null | undefined = null): [number, number] | null {
  if (usual == null || !Number.isFinite(usual)) return null;
  return [Math.min(usual * (1 - HIGHER_PCT / 100), low ?? Infinity), Math.max(usual * (1 + HIGHER_PCT / 100), high ?? -Infinity)];
}
