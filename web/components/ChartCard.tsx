import type { ReactNode } from "react";

import type { Meta } from "@/lib/api/types";
import type { Cadence } from "@/lib/freshness";

import { Provenance, provenanceProblems } from "./Provenance";
import { ErrorState } from "./States";

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
  cadence?: Cadence;
  now?: Date;
  /** 3 inside a section that already has an h2 (e.g. the Overview's findings). */
  headingLevel?: 2 | 3;
}

/**
 * A titled chart with its provenance footer. If meta has no usable as_of or no source, the chart
 * is NOT rendered: a figure without a date and source is never shown.
 */
export function ChartCard({ title, slug, meta, children, description, caveat, notes, detail, cadence, now, headingLevel = 2 }: ChartCardProps) {
  const id = `chart-${(slug ?? (typeof title === "string" ? title : "card")).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const problems = provenanceProblems(meta);
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <section aria-labelledby={id} data-testid="chart-card" className="rounded-lg border border-line bg-surface p-4 shadow-sm">
      <Heading id={id} className="text-base font-semibold text-ink">
        {title}
      </Heading>
      {description ? <div className="mt-1 text-sm text-muted">{description}</div> : null}
      {problems.length ? (
        <div className="mt-4">
          <ErrorState title="This chart can't be shown" error={{ message: `The data can't be shown because ${problems.join(" and ")}.` }} />
        </div>
      ) : (
        <>
          <div className="mt-4">{children}</div>
          <Provenance meta={meta} caveat={caveat} notes={notes} detail={detail} cadence={cadence} now={now} />
        </>
      )}
    </section>
  );
}
