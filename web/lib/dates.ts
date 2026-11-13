/**
 * as_of values from the API are Singapore time without an offset: either a date ("2026-10-31")
 * or a date and time ("2026-11-06T12:01:49"). JavaScript would read the first as UTC midnight and
 * the second as the server's local time, so both are pinned to SGT (+08:00) here.
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const NAIVE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

export function parseAsOf(value: string | null | undefined): Date | null {
  if (!value) return null;
  const v = value.trim();
  const iso = DATE_ONLY.test(v) ? `${v}T00:00:00+08:00` : NAIVE.test(v) ? `${v}+08:00` : v;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function hasTime(value: string): boolean {
  return !DATE_ONLY.test(value.trim());
}

const DAY = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", year: "numeric" });
const TIME = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", hour: "numeric", minute: "2-digit" });

/** "31 Oct 2026", or "6 Nov 2026, 12:01 pm SGT" with withTime. "unknown date" if unparseable. */
export function formatAsOf(value: string, opts: { withTime?: boolean } = {}): string {
  const d = parseAsOf(value);
  if (!d) return "unknown date";
  return opts.withTime && hasTime(value) ? `${DAY.format(d)}, ${TIME.format(d)} SGT` : DAY.format(d);
}

/**
 * Items in date order, by their real dates (Date values), never by their text: a label like "7 Sep"
 * sorted as text comes before "31 Aug" (audit A5). Stable for equal dates. If any key isn't a date,
 * the list is returned in the order given: a category axis keeps its own order.
 */
export function sortByDate<T>(items: readonly T[], key: (item: T) => string): T[] {
  const times = items.map((item) => parseAsOf(key(item))?.getTime() ?? null);
  if (times.some((t) => t == null)) return [...items];
  return items.map((item, i) => ({ item, t: times[i] as number, i }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.item);
}
