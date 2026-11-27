import Link from "next/link";

import type { Meta } from "@/lib/api/types";
import { evidenceOf, safeDetail, sampleText } from "@/lib/evidence";
import { findingMeta, sharedFindingMeta } from "@/lib/provenance";
import { chartFormat, chartTitle, type StoryInsight } from "@/lib/story";
import { FINDING_GROUPS } from "@/lib/testLedger";

import { FreshnessBadge } from "../FreshnessBadge";
import { Glossed } from "../terms/Glossed";
import { AnnotatedChart, fromInsightChart } from "./AnnotatedChart";
import { EvidenceChip } from "./EvidenceChip";
import { AsOfLine } from "./Sections";

/** The detectors in the order a reader meets them: bed-wait patterns first, then clinics (lib/testLedger.ts). */
export const GROUPS = FINDING_GROUPS;

/** The published findings by detector, in GROUPS order; a detector with none is left out. */
export function groupFindings(insights: StoryInsight[]): { group: (typeof GROUPS)[number]; items: StoryInsight[] }[] {
  return GROUPS.map((group) => ({ group, items: insights.filter((i) => i.type === group.type) })).filter((g) => g.items.length);
}

/**
 * Every finding the engine published this week, not only the headlines: grouped by the question it answers, each one closed
 * until opened (its chart, detail and method inside). The text and numbers are the engine's; this component only groups them.
 */
export function AllFindings({ insights, meta, hasTests = false }: { insights: StoryInsight[]; meta: Meta; hasTests?: boolean }) {
  const groups = groupFindings(insights);
  if (!groups.length) return null;
  return (
    <section aria-labelledby="all-findings" className="section" data-testid="all-findings">
      <h2 id="all-findings" className="font-semibold text-ink text-h2">Every finding this week</h2>
      <p className="mt-2 max-w-prose text-ink">
        The {insights.length} other {insights.length === 1 ? "finding" : "findings"} that passed {insights.length === 1 ? "its" : "their"} checks
        in this data release, grouped by the question they answer. Open one to see its chart.
        {hasTests ? <> <Link href="#tests">Every test run, including the ones that found nothing</Link></> : null}
      </p>
      {groups.map(({ group, items }) => {
        const shared = sharedFindingMeta(items, meta);
        return (
          <div key={group.type} className="mt-8" data-testid="finding-group" data-type={group.type}>
            <h3 className="font-semibold text-ink text-h3">{group.title} <span className="font-normal text-muted">({items.length})</span></h3>
            <p className="mt-1 max-w-prose text-small text-muted">{group.question}</p>
            {shared ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-small text-muted" data-testid="group-meta">
                <FreshnessBadge meta={shared} dateInLine />
                <AsOfLine asOf={shared.as_of} meta={shared} bySource />
              </div>
            ) : null}
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {items.map((i) => {
                const own = findingMeta(i, meta);
                return (
                  <li key={i.insight_id} data-testid="finding-row" data-insight={i.insight_id}>
                    <details>
                      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 py-3">
                        {/* plain: a term's tip is a button, and a button can't sit inside the summary (itself a control) */}
                        <span className="min-w-0 flex-1 basis-64 text-ink"><Glossed text={i.headline} plain /></span>
                        <span className="flex flex-wrap items-center gap-x-2 text-meta text-muted">
                          <EvidenceChip level={evidenceOf(i)} />
                          <span>{sampleText(i)}</span>
                        </span>
                      </summary>
                      <div className="grid gap-4 pb-6 lg:grid-cols-12">
                        <div className="max-w-prose space-y-2 text-small text-muted lg:col-span-5">
                          <p className="text-ink"><Glossed text={safeDetail(i)} /></p>
                          {i.caveats[0] ? <p><Glossed text={i.caveats[0]} /></p> : null}
                          <p><span className="font-semibold text-ink">Method: </span>{i.method}</p>
                        </div>
                        <div className="min-w-0 lg:col-span-7">
                          <AnnotatedChart id={`${i.insight_id}-all`} title={chartTitle(i)}
                                          description={i.chart.y_label === chartTitle(i) ? undefined : i.chart.y_label}
                                          meta={own} bySource findingTo={i.as_of} section={shared ?? undefined}
                                          format={chartFormat(i)} headingLevel={4} {...fromInsightChart(i.chart)} />
                        </div>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
