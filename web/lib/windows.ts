/**
 * Time windows in words: the one place the site writes "latest complete week", "vs usual (previous
 * 8 complete weeks)", "last 12 weeks" or a date range. Every KPI, chart and table title says its
 * window through formatWindow(); a test fails on a window typed anywhere else (lib/windows.test.ts).
 *
 * "Latest complete week", not "last week": MOH publishes with a lag, so the newest complete week is
 * often two or three weeks before today, and "last week" would be wrong.
 */
import { formatAsOf } from "./dates";
import { formatWeek, type WeekRange } from "./weeks";

/** The usual level: the median of this many complete weeks before the latest (lib/edCompare.ts). */
export const USUAL_WEEKS = 8;
/** The cards' line and the summary sparkline. */
export const SPARK_WEEKS = 12;
/** The weekday pattern. */
export const PROFILE_WEEKS = 26;

export type Window =
  /** The latest complete week, with its dates when they are known. */
  | { kind: "latest_week"; week?: WeekRange | null }
  /** The usual level the latest week is compared with. */
  | { kind: "usual" }
  /** The last n complete weeks, up to the latest. */
  | { kind: "weeks"; n: number }
  /** A range of days, both ends included. */
  | { kind: "days"; from: string; to: string };

/** The window in words. `capital` starts it with a capital letter, for the start of a line. */
export function formatWindow(w: Window, { capital = false }: { capital?: boolean } = {}): string {
  const text = (() => {
    switch (w.kind) {
      case "latest_week":
        return w.week ? `latest complete week (${formatWeek(w.week)})` : "latest complete week";
      case "usual":
        return `vs usual (previous ${USUAL_WEEKS} complete weeks)`;
      case "weeks":
        return `last ${w.n} weeks`;
      case "days":
        return `${formatAsOf(w.from)} to ${formatAsOf(w.to)}`;
    }
  })();
  return capital ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
