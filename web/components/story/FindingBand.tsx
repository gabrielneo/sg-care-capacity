import Link from "next/link";

import type { Meta } from "@/lib/api/types";
import { formatAsOf } from "@/lib/dates";
import { evidenceOf, safeDetail, sampleText } from "@/lib/evidence";
import { findingMeta, provenanceLineKey } from "@/lib/provenance";
import { chartFormat, chartTitle, type StoryInsight } from "@/lib/story";

import { Section } from "../Section";
import { Glossed } from "../terms/Glossed";
import { AnnotatedChart, fromInsightChart } from "./AnnotatedChart";
import { DeltaNumber, deltaFromDisplay } from "./DeltaNumber";
import { EvidenceChip } from "./EvidenceChip";

/**
 * One finding as a band: number and headline on the left (5/12), its chart on the right (7/12), stacked on a phone.
 * Under them: the evidence level, n, the method in one line, the caveat in a quiet aside, and the rest behind a drawer.
 * Nothing is dropped from the old scroll story; the extra caveats moved into the drawer.
 */
export function FindingBand({ insight, index, total, meta, tone, section }: {
  insight: StoryInsight; index: number; total: number; meta: Meta; tone: "page" | "band";
  /** The Findings section's shared date and sources (sharedFindingMeta); the chart inherits it when its own are the same. */
  section?: Meta | null;
}) {
  const own = findingMeta(insight, meta);
  // The section's line prints what this chart's own line would (same publishers and dates), so the chart inherits it:
  // passing its own meta as the section makes ChartFrame drop the repeat. Its data-quality warnings stay with the chart.
  const inherit = section != null && provenanceLineKey(section) === provenanceLineKey(own);
  const [first, ...more] = insight.caveats;
  return (
    <Section tone={tone} id={insight.insight_id}>
      <article data-testid="finding-band" data-insight={insight.insight_id}>
        <div className="grid gap-x-6 gap-y-4 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="text-meta font-semibold uppercase tracking-wide text-muted">Finding {index + 1} of {total}</p>
            <h3 className="mt-1 font-semibold leading-snug text-ink text-h3" data-testid="step-headline">
              <Glossed text={insight.headline} />
            </h3>
            <DeltaNumber {...deltaFromDisplay(insight.display, insight.direction)} />
            <p className="max-w-prose text-ink" data-testid="step-detail"><Glossed text={safeDetail(insight)} /></p>
          </div>
          <div className="min-w-0 lg:col-span-7">
            <AnnotatedChart
              id={`${insight.insight_id}-chart`}
              title={chartTitle(insight)}
              description={insight.chart.y_label === chartTitle(insight) ? undefined : insight.chart.y_label}
              meta={own}
              bySource
              findingTo={insight.as_of}
              section={inherit ? own : undefined}
              format={chartFormat(insight)}
              headingLevel={3}
              {...fromInsightChart(insight.chart)}
            />
          </div>
        </div>
        <div className="mt-6 max-w-prose">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-small text-muted" data-testid="step-evidence">
            <EvidenceChip level={evidenceOf(insight)} />
            <span>{sampleText(insight)}</span>
          </p>
          {first ? (
            <aside className="mt-3 rounded-md bg-sunken px-3 py-2 text-small text-muted" aria-label="Caveat" data-testid="finding-caveat">
              <Glossed text={first} />
            </aside>
          ) : null}
          <details className="mt-2" data-testid="finding-more">
            <summary className="min-h-11 cursor-pointer select-none py-3 text-small font-semibold text-accent">More about these figures</summary>
            <div className="space-y-2 pb-2 text-small text-muted">
              {/* The test's technical name sits here, not in the open (critique, 20 Nov 2026): the evidence label above says it in words. */}
              <p data-testid="finding-method"><span className="font-semibold text-ink">Method: </span>{insight.method}</p>
              {more.map((c) => <p key={c}><Glossed text={c} /></p>)}
              <p data-testid="finding-window-range">
                {insight.period_start && insight.period_end
                  ? <>Uses data from {formatAsOf(insight.period_start)} to {formatAsOf(insight.period_end)}.</>
                  : <>Uses data to {formatAsOf(insight.as_of)}.</>}
              </p>
              <p><Link href="/docs/insights-method">How findings are tested</Link></p>
            </div>
          </details>
        </div>
      </article>
    </Section>
  );
}
