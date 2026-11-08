import Link from "next/link";

import { Provenance } from "@/components/Provenance";
import { Glossed } from "@/components/terms/Glossed";
import { Term } from "@/components/terms/Term";
import type { Meta } from "@/lib/api/types";
import type { Takeaway } from "@/lib/takeaways";

/** Up to three findings, one line each. The full sentence and the statistics are a click away. */
export function Takeaways({ items, meta }: { items: Takeaway[]; meta: Meta }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="takeaways-heading" className="py-8" data-testid="takeaways">
      <h2 id="takeaways-heading" className="text-xl font-semibold tracking-tight text-ink">Key takeaways</h2>
      <p className="mt-1 max-w-prose text-sm text-muted">Patterns in the latest data that passed a fixed statistical check.</p>
      <ul className="mt-4 grid gap-3 md:grid-cols-3">
        {items.map((t) => (
          <li key={t.id} className="rounded-xl border border-line bg-surface p-4 shadow-sm" data-testid="takeaway" data-insight={t.id}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t.isHospital ? <Term id={t.entity.toLowerCase()} plain /> : <Glossed text={t.entity} plain />}
            </p>
            <p className="mt-1 text-lg font-semibold leading-snug text-ink" data-testid="takeaway-title"><Glossed text={t.title} /></p>
            {t.numbers ? <p className="mt-1 text-sm text-muted" data-testid="takeaway-numbers"><Glossed text={t.numbers} /></p> : null}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm"><Link href="/findings">See every finding, with charts</Link></p>
      <Provenance meta={meta} compact />
    </section>
  );
}
