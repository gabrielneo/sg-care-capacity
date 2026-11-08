/**
 * Dates for figures built from more than one source, or from a finding's window (audit H-1, M-1, M-2).
 * Every source in meta.sources carries its own as_of; a figure shows the date of each source it uses,
 * never one source's date for another's figures.
 */
import type { Insight, Meta, Source } from "./api/types";
import { parseAsOf } from "./dates";
import { type Cadence, CADENCE_BY_SOURCE } from "./freshness";

export interface SourceDate {
  /** The publisher, e.g. "MOH" (sources from one publisher are grouped). */
  name: string;
  asOf: string;
  cadence: Cadence;
}

const publisherOf = (s: Source) => s.name.split(",")[0]?.trim() || s.id;

/** The oldest as_of among these sources, compared as times. Null if none has a date. */
export function oldestAsOf(sources: Source[]): string | null {
  const dated = sources.flatMap((s) => {
    const t = parseAsOf(s.as_of);
    return t && s.as_of ? [[t.getTime(), s.as_of] as const] : [];
  });
  return dated.length ? dated.reduce((a, b) => (b[0] < a[0] ? b : a))[1] : null;
}

/** One date per publisher (its sources' oldest), in the order the sources are listed. */
export function sourceDates(sources: Source[]): SourceDate[] {
  const groups = new Map<string, Source[]>();
  for (const s of sources) groups.set(publisherOf(s), [...(groups.get(publisherOf(s)) ?? []), s]);
  return [...groups].flatMap(([name, group]) => {
    const asOf = oldestAsOf(group);
    return asOf ? [{ name, asOf, cadence: CADENCE_BY_SOURCE[group[0]!.id] ?? "weekly" }] : [];
  });
}

/**
 * The meta for one finding: only the sources it is computed from, dated by those sources (not by
 * the end of the finding's window, which the finding's own as_of gives). A release from before
 * source_ids keeps every source.
 */
export function findingMeta(insight: Pick<Insight, "source_ids" | "as_of">, meta: Meta): Meta {
  const ids = insight.source_ids ?? [];
  const sources = ids.length ? meta.sources.filter((s) => ids.includes(s.id)) : meta.sources;
  return { ...meta, sources, as_of: oldestAsOf(sources) ?? insight.as_of };
}
