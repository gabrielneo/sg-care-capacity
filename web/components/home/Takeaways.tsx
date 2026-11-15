import Link from "next/link";

import { Provenance } from "@/components/Provenance";
import { Glossed } from "@/components/terms/Glossed";
import { Term } from "@/components/terms/Term";
import type { Meta } from "@/lib/api/types";
import { type Takeaway, takeawaysMeta } from "@/lib/takeaways";

/** Up to three findings, one line each. The full sentence and the statistics are a click away. */
export function Takeaways({ items, meta }: { items: Takeaway[]; meta: Meta }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="takeaways-heading" className="py-8" data-testid="takeaways">
      <h2 id="takeaways-heading" className="font-semibold text-ink text-h2">Key takeaways</h2>
      <p className="mt-1 max-w-prose text-small text-muted">Patterns in the latest data that passed a fixed statistical check.</p>
      <ul className="mt-4 card-grid md:grid-cols-3">
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
      {/* Dated, sourced and judged for freshness by the datasets these takeaways use, not every finding's (A2, A3). */}
      <Provenance meta={takeawaysMeta(items, meta)} compact />
    </section>
  );
}
