/**
 * Dates for figures built from more than one source, or from a finding's window (audit H-1, M-1, M-2).
 * Every source in meta.sources carries its own as_of; a figure shows the date of each source it uses,
 * never one source's date for another's figures.
 */
import type { Insight, Meta, Source } from "./api/types";
import { parseAsOf } from "./dates";
import { type Cadence, cadenceOf } from "./freshness";

export interface SourceDate {
  /** The publisher, e.g. "MOH" (sources from one publisher are grouped). */
  name: string;
  asOf: string;
  cadence: Cadence;
  /** The publisher's sources, each judged by its own freshness rule (docs/datasets.yml). */
  sources: Source[];
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
    return asOf ? [{ name, asOf, cadence: cadenceOf(group[0]!.id), sources: group }] : [];
  });
}

/**
 * The meta for one finding: only the sources it is computed from and the warnings on its tables, dated by those sources (not by
 * the end of the finding's window, which the finding's own as_of gives). A release from before
 * source_ids keeps every source.
 */
export function findingMeta(insight: Pick<Insight, "source_ids" | "as_of" | "dq_tables">, meta: Meta): Meta {
  const ids = insight.source_ids ?? [];
  const sources = ids.length ? meta.sources.filter((s) => ids.includes(s.id)) : meta.sources;
  // Only the warnings on the tables this finding uses (audit L-7).
  const tables = insight.dq_tables ?? [];
  const dq_warnings = tables.length ? meta.dq_warnings.filter((w) => tables.includes(w.table)) : meta.dq_warnings;
  return { ...meta, sources, dq_warnings, as_of: oldestAsOf(sources) ?? insight.as_of };
}

/**
 * What a provenance line prints, as a key: the date and each publisher with its own date (AsOfLine, bySource). Two metas with
 * the same key print the same "Data as of ... · Source: ..." line, even when they cite different datasets of one publisher
 * (a finding on bed waits and one on bed waits and attendances both read "MOH, 31 Oct").
 */
export function provenanceLineKey(meta: Pick<Meta, "as_of" | "sources">): string {
  return `${meta.as_of}|${sourceDates(meta.sources).map((d) => `${d.name}@${d.asOf}`).sort().join(",")}`;
}

/**
 * The one date and source line for a list of findings (CLAUDE.md data principle 4: once per section), or null when the
 * findings' lines would differ (then each chart keeps its own). Its sources are every finding's, so its link and freshness
 * badge cover them all. Its data-quality warnings are empty on purpose: each finding's own warnings stay with its chart.
 */
export function sharedFindingMeta(insights: Pick<Insight, "source_ids" | "as_of" | "dq_tables">[], meta: Meta): Meta | null {
  const metas = insights.map((i) => findingMeta(i, meta));
  const first = metas[0];
  if (!first || !metas.every((m) => provenanceLineKey(m) === provenanceLineKey(first))) return null;
  const used = new Set(metas.flatMap((m) => m.sources.map((src) => src.id)));
  return { ...first, sources: meta.sources.filter((src) => used.has(src.id)), dq_warnings: [] };
}
