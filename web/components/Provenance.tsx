import Link from "next/link";
import type { ReactNode } from "react";

import type { Meta, Source } from "@/lib/api/types";
import { formatAsOf, parseAsOf } from "@/lib/dates";
import { cadenceOf } from "@/lib/freshness";
import { sourceDates } from "@/lib/provenance";

import { FreshnessBadge } from "./FreshnessBadge";
import { Glossed } from "./terms/Glossed";

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

/**
 * The date and source as one plain line: for a caption copied away from the page, or inside a link, where a glossary
 * popover can't sit (the Explore cards).
 */
export function provenanceText(meta: Meta, { withTime = false }: { withTime?: boolean } = {}): string {
  return `Data as of ${formatAsOf(meta.as_of, { withTime })} · Source: ${publishers(meta.sources).map((p) => p.name).join(", ")}`;
}

/** Why a meta can't back a figure: no parseable as_of, or no source. Empty list = fine. */
export function provenanceProblems(meta: Meta | null | undefined): string[] {
  if (!meta) return ["no meta"];
  const problems: string[] = [];
  if (!parseAsOf(meta.as_of)) problems.push("its date is missing");
  if (!meta.sources?.length) problems.push("its source is missing");
  return problems;
}

/**
 * The footer every data component renders: "Data as of {date} · Source: {publisher} · {caveat}"
 * and the freshness badge.
 * - Public pages: the caveat and notes are the site's own plain text (lib/copy.ts), and data-quality
 *   warnings are summarised with a link to the Data Quality page.
 * - detail: also lists the API's own caveats and each warning's check and details (technical
 *   wording; only on the Data Quality page).
 * - bySource: for a figure combining sources current at different times (e.g. NUHS's estimate beside
 *   MOH's daily figure), each publisher's own date and freshness badge instead of one date for all.
 * - findingTo: for a finding, the end of the data window it tests ("uses data to"). The date and badge
 *   stay the source's own, so a finding's window never makes current data look stale.
 * - release: the date is when the whole data release was checked, not one source's: it is labelled so,
 *   with no freshness badge (no single source's cadence applies to it).
 */
export function Provenance({
  meta,
  caveat,
  notes = [],
  detail = false,
  now,
  compact = false,
  bySource = false,
  findingTo,
  release = false,
  freshness = true,
  tight = false,
  large = false,
  inherited = false,
  actions,
}: {
  meta: Meta;
  caveat?: string | null;
  notes?: string[];
  detail?: boolean;
  now?: Date;
  compact?: boolean;
  bySource?: boolean;
  findingTo?: string | null;
  release?: boolean;
  /** false: no freshness badge (a block of tiles that shows one for them all). The date and source stay. */
  freshness?: boolean;
  /** Less space above the line, for a small tile. */
  tight?: boolean;
  /** 14px instead of 12px: the public view's size for the date and source. */
  large?: boolean;
  /**
   * The date and source are the section's (lib/sectionMeta.ts), so no line or badge: only "More about these figures", when this
   * figure has notes or data-quality warnings of its own. Renders nothing when it has none.
   */
  inherited?: boolean;
  /** Controls that share the badge's row (a chart's downloads), so a chart's footer is two rows, not four. */
  actions?: ReactNode;
}) {
  // Each source is judged by its own rule (docs/datasets.yml). One date for the figure: its badge is the least
  // fresh of its sources. By source: each publisher's own date and badge.
  const perSource = bySource ? sourceDates(meta.sources) : [];
  const live = meta.sources.length > 0 && meta.sources.every((s) => cadenceOf(s.id) === "moment");
  const dates = perSource.length > 1 ? perSource
    : [{ name: "", asOf: meta.as_of, cadence: live ? "moment" as const : "weekly" as const, sources: meta.sources }];
  const warnings = meta.dq_warnings;
  const extra = detail ? meta.caveats : notes;
  const count = extra.length + (detail ? warnings.length : warnings.length ? 1 : 0);
  if (inherited && (compact || count === 0) && !actions) return null;
  return (
    <footer className={`${tight ? "mt-2 pt-2" : "mt-4 pt-3"} border-t border-line ${large ? "text-small" : "text-meta"} text-muted`}
            data-testid={inherited ? "provenance-inherited" : undefined}>
      {inherited ? null : (
        <p data-testid="provenance-line">
          Data as of{" "}
          {dates.map((d, i) => (
            <span key={d.name || "all"}>
              {i > 0 ? " and " : null}
              <time dateTime={d.asOf}>{formatAsOf(d.asOf, { withTime: d.cadence === "moment" })}</time>
              {d.name ? ` (${d.name})` : null}
            </span>
          ))}
          {" · Source: "}
          {publishers(meta.sources).map((p, i) => (
            <span key={p.name}>
              {i > 0 ? ", " : null}
              {p.url ? (
                <a href={p.url} title={p.full} className="underline">
                  <Glossed text={p.name} plain />
                </a>
              ) : (
                <span title={p.full}><Glossed text={p.name} /></span>
              )}
            </span>
          ))}
          {release ? " (when this data release was checked)" : null}
          {findingTo ? (
            <span data-testid="finding-window">
              {" · This finding uses data to "}<time dateTime={findingTo}>{formatAsOf(findingTo)}</time>
            </span>
          ) : null}
          {caveat && !compact ? <>{" · "}<Glossed text={caveat} /></> : null}
        </p>
      )}
      {/* The freshness badge and "More about these figures" share one row (review, open item 5). The badge leaves out the date,
          which the line above already gives. An open list takes the whole row, below the toggle. */}
      <div className={inherited && !actions ? undefined : "mt-1 flex flex-wrap items-center gap-x-4"}>
        {inherited || release || !freshness ? null : dates.map((d) => (
          <FreshnessBadge key={d.name || "all"} meta={{ sources: d.sources }} now={now} source={d.name || undefined} dateInLine />
        ))}
        {!compact && count > 0 ? (
          <details className="open:basis-full">
            <summary className="min-h-11 cursor-pointer select-none py-3 text-accent">More about these figures ({count})</summary>
            <ul className="mt-1 list-disc space-y-1 pl-6">
              {extra.map((n) => (
                <li key={n}>{detail ? n : <Glossed text={n} />}</li>
              ))}
              {detail
                ? warnings.map((w) => (
                    <li key={`${w.check_id}:${w.table}`}>
                      Data-quality {w.severity === "ERROR" ? "issue" : "warning"} <code>{w.check_id}</code>
                      {` (${w.failing_rows} ${w.failing_rows === 1 ? "row" : "rows"})`}
                      {w.details ? `: ${w.details}` : null}
                    </li>
                  ))
                : warnings.length ? (
                    <li>
                      {warnings.length} data-quality {warnings.length === 1 ? "warning applies" : "warnings apply"} to these figures.{" "}
                      <Link href="/data-quality">See Data Quality</Link>
                    </li>
                  ) : null}
            </ul>
          </details>
        ) : null}
        {actions}
      </div>
    </footer>
  );
}
