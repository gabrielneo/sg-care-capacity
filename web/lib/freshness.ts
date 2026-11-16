/**
 * How fresh each dataset is: one function, one config (docs/datasets.yml, generated into
 * lib/datasets.generated.ts; the pipeline's insight ranking reads the same file).
 *
 * - Each dataset has its own cadence and limits: MOH publishes weekly, SingStat once a year, and the
 *   CHAS clinic list was last updated in June 2024 (so it shows as old, which is true).
 * - The age counts from the dataset's own as-of date (the last day its figures describe), never from
 *   the date of the site's data release.
 * - A figure computed from several datasets (a finding, a takeaway) inherits the least fresh of them,
 *   so it can never say "Up to date" while one of its sources says "Due an update".
 * - `now` is injected everywhere, so tests never read the real clock.
 */
import type { Meta, Source } from "./api/types";
import { DATASETS, type DatasetCadence, type DatasetRule, type Span } from "./datasets.generated";
import { formatAsOf, parseAsOf } from "./dates";

export type Cadence = DatasetCadence;
export type Level = "up_to_date" | "due" | "overdue" | "unknown";

export const LABELS: Record<Level, string> = {
  up_to_date: "Up to date",
  // Not "Ageing": on a site about an ageing population, testers read it as a topic tag (comprehension report).
  due: "Due an update",
  overdue: "Overdue",
  unknown: "Date unknown",
};

/** The cadence in a word or two, as the badge shows it. */
export const CADENCE_TEXT: Record<Cadence, string> = {
  weekly: "weekly",
  yearly: "yearly",
  irregular: "updated irregularly",
  moment: "a reading at one moment",
};

/** Least fresh last: what a combined figure inherits is the furthest along this list. */
const ORDER: readonly Level[] = ["up_to_date", "due", "overdue", "unknown"];

/** An unknown source id is judged as an irregular list: the most lenient rule, never a false alarm. */
const FALLBACK: DatasetRule = { label: "Data", publisher: "", cadence: "irregular", due_after: { months: 12 }, overdue_after: { months: 24 } };

export function datasetRule(sourceId: string): DatasetRule {
  return DATASETS[sourceId] ?? FALLBACK;
}

export const cadenceOf = (sourceId: string): Cadence => datasetRule(sourceId).cadence;

function addSpan(d: Date, span: Span): Date {
  const out = new Date(d.getTime());
  if (span.months) out.setUTCMonth(out.getUTCMonth() + span.months);
  if (span.days) out.setUTCDate(out.getUTCDate() + span.days);
  return out;
}

const spanText = (s: Span) => (s.months ? `${s.months} months` : `${s.days} day${s.days === 1 ? "" : "s"}`);

/** "weekly: due an update after 10 days, overdue after 21 days", for the Data Quality page and the badge's tooltip. */
export function ruleText(sourceId: string): string {
  const r = datasetRule(sourceId);
  if (r.inherits) return `${CADENCE_TEXT[r.cadence]}: as fresh as the least fresh data it uses`;
  return `${CADENCE_TEXT[r.cadence]}: due an update after ${spanText(r.due_after!)}, overdue after ${spanText(r.overdue_after!)}`;
}

export function humanAge(ms: number): string {
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return "under a day";
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 60) return `${Math.floor(days / 7)} weeks`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months} months`;
  return `${Math.floor(months / 12)} years`;
}

export interface Freshness {
  level: Level;
  label: string;
  /** The as-of date the age counts from (the dataset's own). */
  asOf: string;
  /** "2 weeks", or null when the date can't be read. */
  age: string | null;
  cadence: Cadence;
  /** The dataset it was judged by (for a combined figure, the least fresh one). */
  sourceId: string;
}

/** One dataset's freshness: its own as-of date against its own limits. */
export function datasetFreshness(sourceId: string, asOf: string, now: Date = new Date()): Freshness {
  const rule = datasetRule(sourceId);
  const d = parseAsOf(asOf);
  if (!d || rule.inherits) return { level: "unknown", label: LABELS.unknown, asOf, age: null, cadence: rule.cadence, sourceId };
  const level: Level = now <= addSpan(d, rule.due_after!) ? "up_to_date" : now <= addSpan(d, rule.overdue_after!) ? "due" : "overdue";
  return { level, label: LABELS[level], asOf, age: humanAge(Math.max(0, now.getTime() - d.getTime())), cadence: rule.cadence, sourceId };
}

/** The least fresh of several. Empty -> unknown. */
export function worstFreshness(list: readonly Freshness[]): Freshness | null {
  if (!list.length) return null;
  return list.reduce((a, b) => (ORDER.indexOf(b.level) > ORDER.indexOf(a.level) ? b : a));
}

/**
 * A figure's freshness from the sources it uses (meta.sources, each with its own as_of): the least
 * fresh of them. This is how findings and takeaways inherit their datasets' freshness.
 */
export function sourcesFreshness(sources: readonly Pick<Source, "id" | "as_of">[], now: Date = new Date()): Freshness | null {
  return worstFreshness(sources.flatMap((s) => (s.as_of ? [datasetFreshness(s.id, s.as_of, now)] : [])));
}

export function metaFreshness(meta: Pick<Meta, "sources">, now: Date = new Date()): Freshness | null {
  return sourcesFreshness(meta.sources, now);
}

/**
 * "Due an update · weekly · as of 31 Oct 2026": the label, the cadence and the as-of date, in that order.
 * withDate false: "Due an update · weekly", for a badge beside a line that already states the date (stated once).
 */
export function freshnessText(f: Freshness, { withDate = true }: { withDate?: boolean } = {}): string {
  if (f.level === "unknown") return f.label;
  const base = `${f.label} · ${CADENCE_TEXT[f.cadence]}`;
  return withDate ? `${base} · as of ${formatAsOf(f.asOf, { withTime: f.cadence === "moment" })}` : base;
}
