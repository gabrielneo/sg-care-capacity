/**
 * When the weekly data release is checked, and when the next check is due.
 *
 * The pipeline runs every Sunday at 08:00 Singapore time (.github/workflows/weekly.yml). MOH
 * publishes with a lag, so a release made this Sunday can still end on a week that finished days
 * earlier: "checked" and "data as of" are different dates, and the site says both.
 */
import { parseAsOf } from "./dates";

const DAY = 86_400_000;
const SGT_OFFSET = 8 * 3_600_000;
const SUNDAY = 0;

const LABEL = new Intl.DateTimeFormat("en-SG", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });

/** The Singapore calendar date of an instant, as a UTC-midnight Date (so day arithmetic has no clock in it). */
function sgDay(d: Date): Date {
  const t = d.getTime() + SGT_OFFSET;
  return new Date(t - (((t % DAY) + DAY) % DAY));
}

/**
 * The first Sunday strictly after the day the release was checked, as that date at 00:00 UTC (= 08:00 SGT, when the
 * pipeline starts), or null if `checkedAt` can't be read.
 */
export function nextWeeklyCheck(checkedAt: string): Date | null {
  const checked = parseAsOf(checkedAt);
  if (!checked) return null;
  const day = sgDay(checked);
  const ahead = ((SUNDAY - day.getUTCDay() + 7) % 7) || 7;
  return new Date(day.getTime() + ahead * DAY);
}

export interface ReleaseCadence {
  /** "Sun 15 Nov": the next scheduled check. */
  next: string;
  /** True once that Sunday is today or earlier and the site is still serving the older release. */
  overdue: boolean;
}

/** The next check after a release, and whether it has already come due without a newer release. */
export function releaseCadence(checkedAt: string, now: Date = new Date()): ReleaseCadence | null {
  const next = nextWeeklyCheck(checkedAt);
  if (!next) return null;
  // `next` is that Sunday's date at 00:00 UTC, which is exactly 08:00 SGT, when the pipeline starts.
  return { next: LABEL.format(next), overdue: now.getTime() >= next.getTime() };
}

/** The footer's sentence about the schedule. Plain words, no new figure. */
export function cadenceSentence(checkedAt: string, now: Date = new Date()): string | null {
  const c = releaseCadence(checkedAt, now);
  if (!c) return null;
  return c.overdue
    ? `Checked weekly on Sundays. The ${c.next} check hasn't produced a newer release yet.`
    : `Checked weekly on Sundays. Next check ${c.next}.`;
}
