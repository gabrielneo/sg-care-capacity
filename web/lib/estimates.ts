/**
 * NUHS estimates as text. NUHS sometimes publishes a bound, "< 1 hour(s)": the API then gives the
 * bound (1) with a qualifier ("<"), and the site says "under 1 hour", never "1 hour" (audit C-1).
 */
import { parseAsOf } from "./dates";

export type Bound = "<" | ">" | null | undefined;

export function estimateText(hours: number | null, bound: Bound = null): string {
  if (hours == null) return "Not stated";
  const n = Number.isInteger(hours) ? String(hours) : hours.toLocaleString("en-SG", { maximumFractionDigits: 1 });
  const unit = hours === 1 ? "hour" : "hours";
  if (bound === "<") return `under ${n} ${unit}`;
  if (bound === ">") return `over ${n} ${unit}`;
  return `${n} ${unit}`;
}

/** "Under 1 hour" at the start of a value cell. */
export function estimateCell(hours: number | null, bound: Bound = null): string {
  const t = estimateText(hours, bound);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * The line under an NUHS estimate shown beside MOH's weekly figures. NUHS publishes on its own page, so
 * its reading has its own time; it says "newer than the weekly data" only when it is (A2). Without the
 * weekly data's date, or if the reading is older, it says only that the time is its own.
 */
export function nuhsTimingNote(snapshotAt: string, weeklyAsOf: string | null | undefined): string {
  const reading = parseAsOf(snapshotAt);
  const weekly = weeklyAsOf ? parseAsOf(weeklyAsOf) : null;
  return reading && weekly && reading > weekly
    ? "Published separately by NUHS, so newer than the weekly data."
    : "Published separately by NUHS, with its own time.";
}
