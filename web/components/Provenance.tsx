import type { Meta, Source } from "@/lib/api/types";
import { formatAsOf, parseAsOf } from "@/lib/dates";
import { type Cadence, cadenceFor } from "@/lib/freshness";

import { FreshnessBadge } from "./FreshnessBadge";

/** "MOH, Waiting Time for Admission to Ward" -> "MOH". One entry per publisher. */
export function publishers(sources: Source[]): { name: string; url: string | null; full: string }[] {
  const seen = new Map<string, { name: string; url: string | null; full: string[] }>();
  for (const s of sources) {
    const name = s.name.split(",")[0]?.trim() || s.id;
    const entry = seen.get(name) ?? { name, url: s.url, full: [] };
    entry.full.push(s.name);
    seen.set(name, entry);
  }
  return [...seen.values()].map((e) => ({ name: e.name, url: e.url, full: e.full.join("; ") }));
}

/** Why a meta can't back a figure: no parseable as_of, or no source. Empty list = fine. */
export function provenanceProblems(meta: Meta | null | undefined): string[] {
  if (!meta) return ["no meta"];
  const problems: string[] = [];
  if (!parseAsOf(meta.as_of)) problems.push("its date (as_of) is missing");
  if (!meta.sources?.length) problems.push("its source is missing");
  return problems;
}

/**
 * The footer every data component renders: "Data as of {date} · Source: {publisher} · {caveat}",
 * the freshness badge, and every caveat and data-quality note behind a disclosure.
 */
export function Provenance({
  meta,
  caveat,
  cadence,
  now,
  compact = false,
}: {
  meta: Meta;
  caveat?: string | null;
  cadence?: Cadence;
  now?: Date;
  compact?: boolean;
}) {
  const c = cadence ?? cadenceFor(meta);
  const shown = caveat === undefined ? (meta.caveats[0] ?? null) : caveat;
  const notes = [...meta.caveats.filter((x) => x !== shown)];
  const warnings = meta.dq_warnings;
  return (
    <footer className="mt-4 border-t border-line pt-3 text-xs text-muted">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p data-testid="provenance-line">
          Data as of <time dateTime={meta.as_of}>{formatAsOf(meta.as_of, { withTime: c === "live" })}</time>
          {" · Source: "}
          {publishers(meta.sources).map((p, i) => (
            <span key={p.name}>
              {i > 0 ? ", " : null}
              {p.url ? (
                <a href={p.url} title={p.full} className="underline">
                  {p.name}
                </a>
              ) : (
                <span title={p.full}>{p.name}</span>
              )}
            </span>
          ))}
          {shown && !compact ? ` · ${shown}` : null}
        </p>
        <FreshnessBadge asOf={meta.as_of} cadence={c} now={now} />
      </div>
      {!compact && (notes.length > 0 || warnings.length > 0) ? (
        <details className="mt-2">
          <summary className="cursor-pointer select-none py-1 text-accent">
            All notes ({notes.length + warnings.length})
          </summary>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
            {warnings.map((w) => (
              <li key={`${w.check_id}:${w.table}`}>
                Data-quality {w.severity === "ERROR" ? "issue" : "warning"} <code>{w.check_id}</code>
                {` (${w.failing_rows} ${w.failing_rows === 1 ? "row" : "rows"})`}
                {w.details ? `: ${w.details}` : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </footer>
  );
}
