import Link from "next/link";
import type { ReactNode } from "react";

import { Prose } from "@/components/Prose";
import { SectionHeading } from "@/components/SectionHeading";
import { Glossed } from "@/components/terms/Glossed";
import type { Insight } from "@/lib/api/types";
import { BED_WAIT_EXPLAINER, CAVEAT } from "@/lib/copy";
import { HIGHER_PCT, MUCH_HIGHER_PCT } from "@/lib/status";
import { USUAL_WEEKS } from "@/lib/windows";
import { EVIDENCE_LABEL, evidenceOf, safeDetail, sampleText } from "@/lib/evidence";

const pText = (p: number | null | undefined) => (p == null ? "not tested" : p < 0.001 ? "below 0.001" : p.toFixed(3));

/**
 * Everything technical: what each figure means, how the badges are set and what the data can't
 * show. A native <details>, so it opens without JavaScript. Closed unless `open`; the analyst view
 * opens it and passes the takeaways' findings, whose statistics are then listed (lib/homeViews.ts).
 */
export function MethodsDrawer({ findings, limits, open = false }: { findings: Insight[]; limits: ReactNode; open?: boolean }) {
  return (
    <section aria-labelledby="methods-heading" className="border-t border-line" data-testid="methods">
      <SectionHeading id="methods-heading" lede="Every figure uses the same definitions: here is what each one means and what the data can't show.">
        How these figures are made
      </SectionHeading>
      <details open={open} className="rounded-xl border border-line bg-surface card" data-testid="methods-drawer">
        <summary className="block cursor-pointer select-none py-3 font-semibold text-accent">Show the data and methods</summary>
        <div className="mt-4 space-y-6 text-small text-ink">
          {/* Four definitions side by side from 1024px, so a wide screen isn't half empty (audit D7). */}
          <dl className="grid gap-x-8 gap-y-6 lg:grid-cols-2" data-testid="methods-definitions">
            <div>
              <dt className="font-semibold text-h3">The bed wait</dt>
              <dd><Prose size="small" className="mt-1"><Glossed text={BED_WAIT_EXPLAINER} /></Prose></dd>
            </div>
            <div>
              <dt className="font-semibold text-h3">The badges</dt>
              <dd>
                <Prose size="small" className="mt-1">
                  Each hospital is compared with itself. &quot;Usual&quot; is the middle value of its {USUAL_WEEKS} complete weeks before the latest
                  one. A week that is {HIGHER_PCT}% or more above usual is higher; {MUCH_HIGHER_PCT}% or more is much higher;
                  {" "}{HIGHER_PCT}% or more below is lower. With fewer than {USUAL_WEEKS} complete weeks, there is no comparison.
                  The badges are a plain comparison, not a statistical test.
                </Prose>
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-h3">Wait to see a doctor</dt>
              <dd><Prose size="small" className="mt-1"><Glossed text={CAVEAT.live} /></Prose></dd>
            </div>
            <div>
              <dt className="font-semibold text-h3">Clinics near you</dt>
              <dd>
                <Prose size="small" className="mt-1">
                  <Glossed text="Polyclinics come from HPB's list of screening centres; GP clinics from the CHAS list on data.gov.sg." />{" "}
                  Distances are straight lines. A postcode that isn&apos;t in the lists is placed at the middle of its postal district.
                </Prose>
              </dd>
            </div>
          </dl>
          {findings.length ? (
            <div>
              <h3 className="font-semibold text-h3">The statistics behind the takeaways</h3>
              <ul className="mt-2 space-y-3" data-testid="methods-findings">
                {findings.map((f) => (
                  <li key={f.insight_id} className="rounded-lg border border-line p-3">
                    <p className="font-semibold"><Glossed text={f.headline} /></p>
                    <p className="mt-1 text-muted"><Glossed text={safeDetail(f)} /></p>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-meta text-muted">
                      <dt>Method</dt><dd><Glossed text={f.method} /></dd>
                      <dt>Evidence</dt><dd data-testid="methods-evidence">{EVIDENCE_LABEL[evidenceOf(f)]}</dd>
                      <dt>Data points</dt><dd className="tabular-nums" data-testid="methods-sample">{sampleText(f)}</dd>
                      <dt>Chance of this by luck (adjusted p)</dt><dd className="tabular-nums">{pText(f.p_adjusted ?? f.p_value)}</dd>
                    </dl>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div data-testid="limits">
            <h3 className="font-semibold text-h3">What the data can&apos;t show</h3>
            <Prose as="div" size="small" className="mt-1">{limits}</Prose>
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
