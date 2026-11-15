import Link from "next/link";

import { viewHref } from "@/lib/homeViews";
import { SectionHeader } from "@/components/SectionHeader";
import { Glossed } from "@/components/terms/Glossed";
import { Term } from "@/components/terms/Term";
import type { Meta } from "@/lib/api/types";
import { takeawaysLede } from "@/lib/ledes";
import { type Takeaway, takeawaysMeta } from "@/lib/takeaways";

/** What a takeaway's finding rests on: its evidence level and its number of data points (lib/evidence.ts). */
export interface TakeawayEvidence { level: string; sample: string }

/**
 * Up to three findings, one line each. Planner (`simple`) ends with a link to the Analyst view; Analyst (`full`) adds each finding's
 * evidence level and number of data points. The full sentence and the statistics stay in the methods section and on /findings.
 */
export function Takeaways({ items, meta, density = "simple", evidence = {} }: {
  items: Takeaway[]; meta: Meta; density?: "simple" | "full"; evidence?: Record<string, TakeawayEvidence> }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="takeaways-heading" className="py-8" data-testid="takeaways">
      {/* Dated, sourced and judged for freshness by the datasets these takeaways use, not every finding's (A2, A3). */}
      <SectionHeader id="takeaways-heading" title="What stands out in the latest data?" lede={takeawaysLede(items.length)} meta={takeawaysMeta(items, meta)} />
      <ul className="card-grid md:grid-cols-3">
        {items.map((t) => (
          <li key={t.id} className="rounded-xl border border-line bg-surface card" data-testid="takeaway" data-insight={t.id}>
            <p className="text-meta font-semibold uppercase tracking-wide text-muted">
              {t.isHospital ? <Term id={t.entity.toLowerCase()} plain /> : <Glossed text={t.entity} plain />}
            </p>
            <p className="mt-1 text-h3 font-semibold leading-snug text-ink" data-testid="takeaway-title"><Glossed text={t.title} /></p>
            {t.numbers ? <p className="mt-1 text-small text-muted" data-testid="takeaway-numbers"><Glossed text={t.numbers} /></p> : null}
            {density === "full" && evidence[t.id] ? (
              <p className="mt-2 text-small text-muted" data-testid="takeaway-evidence">
                Evidence: {evidence[t.id]!.level} · <span className="tabular-nums">{evidence[t.id]!.sample}</span>
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-3 flex flex-wrap gap-x-4 text-small">
        <Link href="/findings" className="inline-flex min-h-11 items-center">See every finding</Link>
        {density === "simple" ? <Link href={`${viewHref("analyst")}#section-takeaways`} data-testid="to-analyst" className="inline-flex min-h-11 items-center">Open the Analyst view</Link> : null}
      </p>
    </section>
  );
}
