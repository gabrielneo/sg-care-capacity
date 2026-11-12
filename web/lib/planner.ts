/**
 * The Planner summary's own arithmetic: the order of the hospital cards, the change against usual
 * as text, and what the four summary tiles show (docs/data_dictionary.md, "Computed by the site").
 *
 * Everything here reads the statuses the cards are drawn from (lib/status.ts): the same latest
 * complete week, the same usual level and the same badge thresholds. Nothing is a second scale.
 */
import { median } from "./edCompare";
import { byPressure, type HospitalStatus } from "./status";

export type Sort = "usual" | "hours" | "name";

export const DEFAULT_SORT: Sort = "usual";

export const SORTS: readonly { id: Sort; label: string }[] = [
  { id: "usual", label: "Against usual" },
  { id: "hours", label: "Hours" },
  { id: "name", label: "A–Z" },
];

/** Anything that isn't a known order (missing, misspelt, repeated) is the default: against usual. */
export function parseSort(value: string | string[] | null | undefined): Sort {
  const one = Array.isArray(value) ? value[0] : value;
  return SORTS.some((s) => s.id === one) ? (one as Sort) : DEFAULT_SORT;
}

/** The home page's address for an order, keeping the rest of the query string. The default order has no ?sort=. */
export function sortHref(sort: Sort, current: string | URLSearchParams = ""): string {
  const q = new URLSearchParams(current);
  q.delete("sort");
  if (sort !== DEFAULT_SORT) q.set("sort", sort);
  const s = q.toString();
  return s ? `/?${s}` : "/";
}

/**
 * The cards in the chosen order; the list given is not changed.
 * - usual: largest % above usual first (the badge's own figure); no comparison last.
 * - hours: longest bed wait first; a hospital with no complete latest week last.
 * - name: A to Z by the name shown on the card (`names`), else by code.
 * Ties go by code, so the order never depends on the order the API returned.
 */
export function sortStatuses(statuses: readonly HospitalStatus[], sort: Sort, names: Record<string, string> = {}): HospitalStatus[] {
  const byCode = (a: HospitalStatus, b: HospitalStatus) => a.code.localeCompare(b.code);
  const hours = (s: HospitalStatus) => s.latest ?? -Infinity;
  const name = (s: HospitalStatus) => names[s.code] ?? s.code;
  const order: Record<Sort, (a: HospitalStatus, b: HospitalStatus) => number> = {
    usual: byPressure,
    // Compared, not subtracted: two missing figures are a tie, not NaN.
    hours: (a, b) => (hours(a) === hours(b) ? byCode(a, b) : hours(b) > hours(a) ? 1 : -1),
    name: (a, b) => name(a).localeCompare(name(b), "en") || byCode(a, b),
  };
  return [...statuses].sort(order[sort]);
}

export interface Delta {
  /** Up, down or level: the shape shown beside the figure, so direction is never colour alone. */
  direction: "up" | "down" | "level";
  /** "▲ 31%", "▼ 18%", "0%": what is shown. */
  text: string;
  /** "+31%", "−18%", "0%": the same figure for a screen reader, signed instead of an arrow. */
  spoken: string;
  /** The whole number shown, signed. */
  whole: number;
}

/**
 * The change against usual as text. Cut to a whole number towards zero, not rounded, so it can't
 * disagree with the badge: +14.6% is "▲ 14%" beside "about usual", never 15%. Under 1% either way
 * is "0%" with no arrow. No usual level (null) gives null: nothing is shown, never a 0%.
 */
export function formatDelta(pct: number | null | undefined): Delta | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  const whole = Math.trunc(pct) || 0; // || 0: never −0
  const size = Math.abs(whole).toLocaleString("en-SG");
  if (whole === 0) return { direction: "level", text: "0%", spoken: "0%", whole };
  return whole > 0
    ? { direction: "up", text: `▲ ${size}%`, spoken: `+${size}%`, whole }
    : { direction: "down", text: `▼ ${size}%`, spoken: `−${size}%`, whole };
}

/** The hospitals whose badge is higher or much higher than usual, largest change first. */
export function aboveUsual(statuses: readonly HospitalStatus[]): HospitalStatus[] {
  return statuses.filter((s) => s.level === "higher" || s.level === "much_higher").sort(byPressure);
}

/**
 * The longest bed wait in the latest complete week, in hours. `exclude` is the urgent care centre:
 * its waits are shorter by design, so it isn't ranked against the full EDs (docs/methodology.md).
 */
export function longestWait(statuses: readonly HospitalStatus[], exclude: readonly string[] = []): HospitalStatus | null {
  const ranked = sortStatuses(statuses.filter((s) => s.latest != null && !exclude.includes(s.code)), "hours");
  return ranked[0] ?? null;
}

/**
 * The hospital furthest from its own usual level, up or down. Each hospital is compared with
 * itself, so the urgent care centre is in. Null when no hospital has a usual level.
 */
export function largestChange(statuses: readonly HospitalStatus[]): HospitalStatus | null {
  const known = statuses.filter((s) => s.pct != null);
  const size = (s: HospitalStatus) => Math.abs(s.pct as number);
  return [...known].sort((a, b) => size(b) - size(a) || a.code.localeCompare(b.code))[0] ?? null;
}

/** A week needs this many hospitals for a middle value across them, as ED Trends' all-hospital band does. */
export const MIN_HOSPITALS = 3;

/**
 * The middle (median) of the hospitals' weekly bed waits, for each of the 12 weeks on the cards'
 * lines, oldest first. It is the median across hospitals of each one's weekly average of daily
 * medians: not a median of patients, which MOH's figures can't give. `exclude` is the urgent care
 * centre. A week with fewer than MIN_HOSPITALS complete hospitals is null: a gap, never a guess.
 */
export function acrossHospitals(statuses: readonly HospitalStatus[], exclude: readonly string[] = []): (number | null)[] {
  const series = statuses.filter((s) => !exclude.includes(s.code)).map((s) => s.spark);
  const weeks = Math.max(0, ...series.map((s) => s.length));
  return Array.from({ length: weeks }, (_, i) => {
    const values = series.map((s) => s[i]).filter((v): v is number => v != null);
    return values.length >= MIN_HOSPITALS ? median(values) : null;
  });
}
