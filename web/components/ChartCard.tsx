import type { ReactNode } from "react";

import type { Meta } from "@/lib/api/types";

import { Provenance, provenanceProblems } from "./Provenance";
import { ErrorState } from "./States";
import { Glossed } from "./terms/Glossed";

export interface ChartCardProps {
  /** The heading. Rich titles (with <Glossed>/<Term>) need a `slug` for the heading's id. */
  title: ReactNode;
  slug?: string;
  /** Required: the response's meta. Its as_of and sources are always shown; there is no way to opt out. */
  meta: Meta;
  children: ReactNode;
  description?: ReactNode;
  /** The site's plain caveat for the footer line (lib/copy.ts). */
  caveat?: string | null;
  /** More plain notes, under "More about these figures". */
  notes?: string[];
  /** Show the API's own caveats and each warning's details (Data Quality only). */
  detail?: boolean;
  now?: Date;
  /** 3 inside a section that already has an h2 (e.g. the Overview's findings). */
  headingLevel?: 2 | 3;
  /** A CSV of the figures behind the chart (requirement S3), from app/export/. */
  download?: string;
  /** Each source's own date and badge (a chart mixing sources from different times). See Provenance. */
  bySource?: boolean;
  /** A finding's data window end ("This finding uses data to"). See Provenance. */
  findingTo?: string | null;
  /** The date is the data release's, not a source's: labelled so, with no badge. See Provenance. */
  release?: boolean;
  /** false: no date and source on this card, because the section around a group of cards states them once (the caller must render a <Provenance>). */
  provenance?: boolean;
}

/**
 * A titled chart with its provenance footer. If meta has no usable as_of or no source, the chart
 * is NOT rendered: a figure without a date and source is never shown.
 */
export function ChartCard({ title, slug, meta, children, description, caveat, notes, detail, now, headingLevel = 2,
                           download, bySource, findingTo, release, provenance = true }: ChartCardProps) {
  const id = `chart-${(slug ?? (typeof title === "string" ? title : "card")).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const problems = provenanceProblems(meta);
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <section aria-labelledby={id} data-testid="chart-card" data-provenance={provenance ? "card" : "section"} className="rounded-lg border border-line bg-surface card">
      <Heading id={id} className="text-body font-semibold text-ink">
        {title}
      </Heading>
      {description ? <div className="mt-1 text-small text-muted">{description}</div> : null}
      {problems.length ? (
        <div className="mt-4">
          <ErrorState title="This chart can't be shown" error={{ message: `The data can't be shown because ${problems.join(" and ")}.` }} />
        </div>
      ) : (
        <>
          <div className="mt-4">{children}</div>
          {provenance ? (
            <Provenance meta={meta} caveat={caveat} notes={notes} detail={detail} now={now}
                        bySource={bySource} findingTo={findingTo} release={release} />
          ) : caveat ? <p className="mt-3 text-meta text-muted" data-testid="card-caveat"><Glossed text={caveat} /></p> : null}
          {download ? (
            <p className="mt-2 text-meta">
              <a href={download} download data-testid="csv-download">Download the figures (CSV)</a>
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
