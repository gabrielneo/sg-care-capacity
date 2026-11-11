import Link from "next/link";
import type { ReactNode } from "react";

import { Glossed } from "@/components/terms/Glossed";
import type { Insight } from "@/lib/api/types";
import { BED_WAIT_EXPLAINER, CAVEAT } from "@/lib/copy";
import { HIGHER_PCT, MUCH_HIGHER_PCT } from "@/lib/status";

const pText = (p: number | null | undefined) => (p == null ? "not tested" : p < 0.001 ? "below 0.001" : p.toFixed(3));

/**
 * Everything technical: what each figure means, how the badges are set and what the data can't
 * show. A native <details>, so it opens without JavaScript. Closed unless `open`; the analyst view
 * opens it and passes the takeaways' findings, whose statistics are then listed (lib/homeViews.ts).
 */
export function MethodsDrawer({ findings, limits, open = false }: { findings: Insight[]; limits: ReactNode; open?: boolean }) {
  return (
    <section aria-labelledby="methods-heading" className="border-t border-line py-8" data-testid="methods">
      <h2 id="methods-heading" className="text-xl font-semibold tracking-tight text-ink">How these figures are made</h2>
      <details open={open} className="mt-3 rounded-xl border border-line bg-surface p-4" data-testid="methods-drawer">
        <summary className="cursor-pointer select-none font-semibold text-accent">Show the data and methods</summary>
        <div className="mt-4 space-y-5 text-sm text-ink">
          <div>
            <h3 className="font-semibold">The bed wait</h3>
            <p className="mt-1 max-w-prose"><Glossed text={BED_WAIT_EXPLAINER} /> <Glossed text={CAVEAT.weeklyAverage} /></p>
          </div>
          <div>
            <h3 className="font-semibold">The badges</h3>
            <p className="mt-1 max-w-prose">
              Each hospital is compared with itself. &quot;Usual&quot; is the middle value of its 8 complete weeks before the latest
              one. A week that is {HIGHER_PCT}% or more above usual is higher; {MUCH_HIGHER_PCT}% or more is much higher;
              {" "}{HIGHER_PCT}% or more below is lower. With fewer than 8 complete weeks, there is no comparison.
              The badges are a plain comparison, not a statistical test.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">Wait to see a doctor</h3>
            <p className="mt-1 max-w-prose"><Glossed text={CAVEAT.live} /></p>
          </div>
          <div>
            <h3 className="font-semibold">Clinics near you</h3>
            <p className="mt-1 max-w-prose">
              <Glossed text="Polyclinics come from HPB's list of screening centres; GP clinics from the CHAS list on data.gov.sg." />{" "}
              Distances are straight lines. A postcode that isn&apos;t in the lists is placed at the middle of its postal district.
            </p>
          </div>
          {findings.length ? (
            <div>
              <h3 className="font-semibold">The statistics behind the takeaways</h3>
              <ul className="mt-2 space-y-3" data-testid="methods-findings">
                {findings.map((f) => (
                  <li key={f.insight_id} className="rounded-lg border border-line p-3">
                    <p className="font-medium"><Glossed text={f.headline} /></p>
                    <p className="mt-1 text-muted"><Glossed text={f.detail} /></p>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted">
                      <dt>Method</dt><dd><Glossed text={f.method} /></dd>
                      <dt>Data points</dt><dd className="tabular-nums">{f.n ?? "not stated"}</dd>
                      <dt>Chance of this by luck (adjusted p)</dt><dd className="tabular-nums">{pText(f.p_adjusted ?? f.p_value)}</dd>
                    </dl>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div data-testid="limits">
            <h3 className="font-semibold">What the data can&apos;t show</h3>
            <div className="mt-1 max-w-prose">{limits}</div>
          </div>
          <p>
            <Link href="/methodology">Full methodology</Link> · <Link href="/docs/insights-method">How findings are tested</Link>
            {" · "}<Link href="/data-quality">Data quality checks</Link>
          </p>
        </div>
      </details>
    </section>
  );
}
