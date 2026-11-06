import type { ReactNode } from "react";

import type { Meta } from "@/lib/api/types";
import type { Cadence } from "@/lib/freshness";

import { Provenance, provenanceProblems } from "./Provenance";
import { ErrorState } from "./States";

export interface ChartCardProps {
  title: string;
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
}

/**
 * A titled chart with its provenance footer. If meta has no usable as_of or no source, the chart
 * is NOT rendered: a figure without a date and source is never shown.
 */
export function ChartCard({ title, meta, children, description, caveat, notes, detail, cadence, now }: ChartCardProps) {
  const id = `chart-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const problems = provenanceProblems(meta);
  return (
    <section aria-labelledby={id} data-testid="chart-card" className="rounded-lg border border-line bg-surface p-4 shadow-sm">
      <h2 id={id} className="text-base font-semibold text-ink">
        {title}
      </h2>
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
