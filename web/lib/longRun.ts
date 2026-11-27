/**
 * The long-run charts on a hospital's page and the month-by-month page: every week since the data starts, the trend test's result in
 * words, and the scatter of the pairs a correlation was tested on. Presentation only: every number is MOH's or the insight engine's
 * (GET /api/v1/ed/weekly, GET /api/v1/insights/tests); nothing here is a new statistic.
 */
import type { EdWeek, InsightTest } from "./api/types";
import { formatAsOf } from "./dates";
import { outcomeOf } from "./testLedger";
import { TREND_WEEKS } from "./windows";

const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

export interface WeeklyLine {
  starts: string[];
  /** Average of daily medians, hours; null for a week that isn't complete (a gap, never joined). */
  values: (number | null)[];
  /** The year at its first week, blank elsewhere: the x axis. */
  labels: string[];
  /** "Week of 6 Jan 2025", for the hover. */
  titles: string[];
}

/** One hospital's weeks from its first complete week to its last, every week in between present (a missing one is null). */
export function weeklyLine(weekly: EdWeek[], code: string): WeeklyLine {
  const own = new Map(weekly.filter((w) => w.hospital_code === code && w.is_complete_week && w.mean_of_daily_median_wait_hours != null)
    .map((w) => [w.week_start, w.mean_of_daily_median_wait_hours as number]));
  const known = [...own.keys()].sort();
  const starts: string[] = [];
  if (known.length) for (let s = known[0] as string; s <= (known.at(-1) as string); s = addDays(s, 7)) starts.push(s);
  return {
    starts,
    values: starts.map((s) => own.get(s) ?? null),
    labels: starts.map((s, i) => (i === 0 || s.slice(0, 4) !== starts[i - 1]?.slice(0, 4) ? s.slice(0, 4) : "")),
    titles: starts.map((s) => `Week of ${formatAsOf(s)}`),
  };
}

/** The weeks the trend test covered: the last TREND_WEEKS of the line, as indexes. Null when the line is shorter. */
export function trendWindow(line: WeeklyLine): { from: number; to: number } | null {
  const n = line.starts.length;
  return n >= TREND_WEEKS ? { from: n - TREND_WEEKS, to: n - 1 } : null;
}

/** Hours to 2 decimals, signed; a value that rounds to zero is "0.00", never "−0.00". */
const h2 = (v: number) => {
  const text = Math.abs(v).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return Number(text) === 0 ? text : `${v < 0 ? "−" : "+"}${text}`;
};

/** The trend test's result for one hospital, in words: its estimate and range, and whether it found a rise or fall. */
export function trendSentence(test: InsightTest | undefined): string | null {
  if (!test || test.metric_value == null) return null;
  const range = test.ci_low != null && test.ci_high != null ? ` (95% range ${h2(test.ci_low)} to ${h2(test.ci_high)})` : "";
  const est = `the estimated change is ${h2(test.metric_value)} hours a week${range}`;
  const o = outcomeOf(test);
  if (o === "published") return `Over the shaded ${TREND_WEEKS} weeks, ${est}: a clear ${test.metric_value > 0 ? "rise" : "fall"}, published as a finding.`;
  if (o === "too_small") return `Over the shaded ${TREND_WEEKS} weeks, ${est}: too small to call a rise or a fall.`;
  if (o === "not_significant") return `Over the shaded ${TREND_WEEKS} weeks, ${est}: the test can't tell a rise or fall from no change.`;
  return null;
}

export interface Scale {
  min: number;
  max: number;
  ticks: number[];
}

/** A round scale that holds every value and 0, with 0 a tick (the scatter's "usual" lines). */
export function zeroScale(values: number[], target = 4): Scale {
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) as number) * mag;
  const min = Math.floor(lo / step - 1e-9) * step;
  const max = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + step / 2; t += step) ticks.push(Number(t.toPrecision(12)));
  return { min, max: max === min ? min + step : max, ticks };
}

export interface ScatterPoint {
  date: string;
  x: number;
  y: number;
}

/** The engine's [date, x, y] pairs as points; a malformed pair is dropped, never guessed. */
export function scatterPoints(test: Pick<InsightTest, "pairs">): ScatterPoint[] {
  return (test.pairs ?? []).flatMap((p) => {
    const [date, x, y] = p;
    return typeof date === "string" && typeof x === "number" && typeof y === "number" ? [{ date, x, y }] : [];
  });
}
