import Link from "next/link";

import { SectionHeader } from "@/components/SectionHeader";
import { Glossed } from "@/components/terms/Glossed";
import { Term } from "@/components/terms/Term";
import type { Meta } from "@/lib/api/types";
import { takeawaysLede } from "@/lib/ledes";
import { type Takeaway, takeawaysMeta } from "@/lib/takeaways";

/** Up to three findings, one line each. The full sentence and the statistics are a click away. */
export function Takeaways({ items, meta }: { items: Takeaway[]; meta: Meta }) {
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
          </li>
        ))}
      </ul>
      <p className="mt-3 text-small"><Link href="/findings">See every finding, with charts</Link></p>
    </section>
  );
}
