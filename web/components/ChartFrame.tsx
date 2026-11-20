import Link from "next/link";
import type { ReactNode } from "react";

import type { Meta } from "@/lib/api/types";
import { inheritsFrom } from "@/lib/sectionMeta";

import { CopyCaption } from "./CopyCaption";
import { Provenance, provenanceProblems, provenanceText } from "./Provenance";
import { EmptyState, ErrorState } from "./States";
import { Glossed } from "./terms/Glossed";

export interface ChartFrameProps {
  /** The heading: a question or a name, with the window in words ("…, last 90 days"). Rich titles (<Glossed>/<Term>) need a `slug`. */
  title: ReactNode;
  slug?: string;
  /** Required: the response's meta. Its date and source are always shown, unless `section` says the section around already does. */
  meta: Meta;
  children: ReactNode;
  /**
   * One sentence of what the chart shows, for screen readers. Read with the chart, never shown (the lede is `description`).
   * Required: a chart without one does not compile.
   */
  summary: string;
  /**
   * A CSV of the figures, from app/export/. Its first lines are `#` rows with the date, source, window and definitions
   * (lib/csv.ts, toCsvWithContext). Required: every chart can be taken away.
   */
  csv: string;
  /**
   * The figures as a table, behind "Show as table". "self": the chart already is a table. { href }: the table is another view
   * of the same page (a map). Required, so leaving one out is a choice.
   */
  table: ReactNode | "self" | { href: string; label?: string };
  description?: ReactNode;
  /** The site's plain caveat for the footer line (lib/copy.ts). */
  caveat?: string | null;
  /** More plain notes, under "More about these figures". */
  notes?: string[];
  /** Show the API's own caveats and each warning's details (Data Quality only). */
  detail?: boolean;
  now?: Date;
  /** 3 inside a section that already has an h2. */
  headingLevel?: 2 | 3;
  /**
   * The meta of the SectionHeader above this chart. When the chart's own date and sources are the same, the section's line
   * covers it and the chart adds none. When they differ (or there is no section), the chart shows its own line.
   */
  section?: Meta;
  /** Each source's own date and badge (a chart mixing sources from different times). */
  bySource?: boolean;
  /** A finding's data window end ("This finding uses data to"). */
  findingTo?: string | null;
  /** The date is the data release's, not a source's: labelled so, with no badge. */
  release?: boolean;
  /** The heading is read by screen readers but not shown: for a chart inside a section whose own heading already asks the question. */
  titleHidden?: boolean;
  /** ready (default), empty (no figures in the window) or error (this chart's data failed to load). */
  state?: "ready" | "empty" | "error";
  /** empty: what to try; error: what failed, in plain words. */
  stateMessage?: ReactNode;
  /** error: where "Try again" goes (the same page, by default the current one is reloaded). */
  retryHref?: string;
}

/**
 * The one frame for every chart (docs/design/redesign_brief.md): a heading that names its window, a lede, the chart, its
 * table behind "Show as table", a CSV, and the date and source once. No JavaScript: the table is a <details>.
 * A chart whose meta has no usable date or source is NOT drawn: a figure without them is never shown.
 */
export function ChartFrame({ title, slug, meta, children, summary, csv, table, description, caveat, notes, detail, now, headingLevel = 2,
                             section, bySource, findingTo, release, titleHidden = false, state = "ready", stateMessage, retryHref }: ChartFrameProps) {
  const id = `chart-${(slug ?? (typeof title === "string" ? title : "card")).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const problems = provenanceProblems(meta);
  if (problems.length && process.env.NODE_ENV !== "production") {
    console.warn(`ChartFrame "${typeof title === "string" ? title : id}" is not drawn: ${problems.join(" and ")}.`);
  }
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const covered = section != null && inheritsFrom(section, meta);
  const hasTable = table !== "self" && !(typeof table === "object" && table !== null && "href" in table);
  const allNotes = caveat ? [caveat, ...(notes ?? [])] : notes;
  // One row at 375px (review N2): "Download" once, then the formats. Each link's name still starts with the verb, and contains its
  // visible text (WCAG 2.5.3); the lead word is hidden from screen readers so it isn't read twice.
  const downloads = state === "ready" ? (
    <span className="inline-flex flex-wrap items-center gap-x-4 text-meta" data-testid="chart-downloads">
      <span aria-hidden="true" className="text-muted">Download</span>
      <a href={csv} download data-testid="csv-download" aria-label="Download CSV" className="inline-flex min-h-11 min-w-11 items-center justify-center">CSV</a>
      <a href={`${csv}${csv.includes("?") ? "&" : "?"}format=xlsx`} download data-testid="xlsx-download" aria-label="Download Excel"
         className="inline-flex min-h-11 min-w-11 items-center justify-center">Excel</a>
      <CopyCaption headingId={id} summary={summary} provenance={provenanceText(meta)} />
    </span>
  ) : null;
  return (
    <section aria-labelledby={id} aria-describedby={`${id}-summary`} data-testid="chart-frame" data-state={problems.length ? "error" : state}
             data-provenance={covered ? "section" : "own"} className="rounded-lg border border-line bg-surface card">
      <Heading id={id} className={titleHidden ? "sr-only" : "text-body font-semibold text-ink"}>{title}</Heading>
      <p id={`${id}-summary`} className="sr-only">{summary}</p>
      {description ? <div className="mt-1 text-small text-muted">{description}</div> : null}
      {problems.length ? (
        <div className="mt-4">
          <ErrorState title="This chart can't be shown" error={{ message: `The data can't be shown because ${problems.join(" and ")}.` }} />
        </div>
      ) : state === "error" ? (
        <div className="mt-4">
          <ErrorState title="This chart couldn't be loaded" error={{ message: "Nothing has been changed or lost. Try again in a moment." }}
                      action={<>{stateMessage ? <p className="mb-2">{stateMessage}</p> : null}<Link href={retryHref ?? ""} className="font-semibold underline" data-testid="retry">Try again</Link></>} />
        </div>
      ) : (
        <>
          <div className="mt-4">
            {state === "empty"
              ? <EmptyState title="No data for this period" message={stateMessage ?? "Try a longer period or other hospitals."} />
              : children}
          </div>
          {state === "ready" && hasTable ? (
            <details className="table-toggle mt-3 border-t border-line pt-3" data-testid="chart-table">
              <summary className="inline-flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-md border border-control bg-surface px-3 text-small font-semibold text-accent hover:bg-accent-soft">
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" /><path d="M1.75 6.25h12.5M1.75 9.75h12.5M6 6.25v7" />
                </svg>
                <span className="when-closed">Show as table</span><span className="when-open">Hide table</span>
              </summary>
              <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="The figures behind the chart, as a table">{table as ReactNode}</div>
            </details>
          ) : null}
          {state === "ready" && typeof table === "object" && table !== null && "href" in table ? (
            <p className="mt-3 border-t border-line pt-3 text-small"><Link href={table.href} className="font-semibold" data-testid="chart-table-link">{table.label ?? "Show as table"}</Link></p>
          ) : null}
          {/* The footer, two rows (critique 20 Nov 2026): the date and source line, then the freshness badge, "More about these
              figures" and the downloads. The caveat sits under "More about these figures" with the other notes, so the line that is
              always in view is only the date and source (CLAUDE.md, data principle 4). Data Quality (detail) keeps it on the line. */}
          {covered ? (
            // The section's line gives the date and source; the chart keeps its own caveat, notes and data-quality warnings.
            <>
              {detail && caveat ? <p className="mt-3 text-meta text-muted" data-testid="card-caveat"><Glossed text={caveat} /></p> : null}
              <Provenance meta={meta} notes={allNotes} detail={detail} inherited actions={downloads} />
            </>
          ) : (
            <Provenance meta={meta} caveat={detail ? caveat : null} notes={detail ? notes : allNotes} detail={detail} now={now} bySource={bySource}
                        findingTo={findingTo} release={release} actions={downloads} />
          )}
        </>
      )}
    </section>
  );
}
