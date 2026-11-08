import type { Metadata } from "next";
import Link from "next/link";

import { PrintButton } from "@/components/PrintButton";
import { ErrorState } from "@/components/States";
import { AsOfLine } from "@/components/story/Sections";
import { Glossed } from "@/components/terms/Glossed";
import { api, settle } from "@/lib/api/client";
import { BED_WAIT_SHORT, plainError, SITE_SCOPE } from "@/lib/copy";
import { formatAsOf } from "@/lib/dates";
import { renderDocList } from "@/lib/docs";
import { term } from "@/lib/glossary";
import { priorityAreas } from "@/lib/accessCharts";
import { findingMeta } from "@/lib/provenance";
import { monthYear, percentText, populationShare, storySteps } from "@/lib/story";
import { SUMMARY_AREAS, summaryAreas } from "@/lib/summary";

export const metadata: Metadata = { title: "One-page summary" };
export const dynamic = "force-dynamic"; // rendered per request; API responses are cached for an hour

const LIMITS_MARKER = "**What the data can't show**";
const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const MISSING = <span className="text-muted">No figure</span>;

/**
 * Requirement S4: the latest findings on one A4 page, for a planner to bring to a meeting. Every
 * figure comes from the API, as on the Overview and the Access Map; the limits from
 * docs/case_study.md. The print styles (globals.css) drop the site's header, nav and footer.
 */
export default async function SummaryPage() {
  const [insights, gaps, areas, population, limits] = await Promise.all([
    settle(api.insights({ headline: true })),
    settle(api.insights({ type: "access_gap", top: SUMMARY_AREAS })),
    settle(api.areasAccess()),
    settle(api.population()),
    renderDocList("case_study.md", LIMITS_MARKER),
  ]);
  const findings = insights.ok ? storySteps(insights.value.data) : [];
  // Dated by the sources these findings use, each with its own date: not by the end of their windows (audit M-1).
  const findingsMeta = insights.ok
    ? findingMeta({ source_ids: [...new Set(findings.flatMap((f) => f.source_ids ?? []))], as_of: insights.value.meta.as_of },
                  insights.value.meta)
    : null;
  const share = population.ok ? populationShare(population.value.data) : null;
  const rows = gaps.ok && areas.ok
    ? summaryAreas(priorityAreas(gaps.value.data), areas.value.data.features.map((f) => f.properties)) : [];
  const areaError = !areas.ok ? areas.error : !gaps.ok ? gaps.error : null;
  const release = insights.ok ? insights.value.meta.snapshot_id : areas.ok ? areas.value.meta.snapshot_id : null;

  const header = (
    <header className="border-b border-line pb-3">
      <p className="text-xs font-medium text-accent" data-testid="summary-release">
        One-page summary{release ? ` · weekly data release ${release}` : null}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Right-siting care in a super-aged Singapore</h1>
      <p className="mt-1 text-muted">
        Right-siting care means <Glossed text={lowerFirst(term("right_siting").plain_definition)} /> <Glossed text={SITE_SCOPE} />
      </p>
    </header>
  );

  // Nothing came back: one message, as on the Overview, not one per block.
  if (!insights.ok && !areas.ok && !population.ok) {
    return (
      <article className="summary mx-auto max-w-3xl text-sm" data-testid="summary">
        {header}
        <div className="mt-4"><ErrorState error={plainError(insights.error)} /></div>
      </article>
    );
  }

  return (
    <article className="summary mx-auto max-w-3xl text-sm" data-testid="summary">
      <div className="print-hide mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/">Back to the Overview</Link>
        <PrintButton />
      </div>

      {header}

      <section aria-labelledby="s-why" className="summary-block mt-3">
        <h2 id="s-why" className="text-base font-semibold text-ink">Why now</h2>
        {share && population.ok ? (
          <>
            <p className="text-ink" data-testid="summary-share">
              <strong>{percentText(share.latest.share_65plus)}</strong> of Singapore residents were aged 65 or over in{" "}
              {monthYear(share.latest.reference_date)}. A <Glossed text="super-aged society" plain /> has 21% or more.
            </p>
            <div className="text-xs text-muted"><AsOfLine asOf={population.value.meta.as_of} meta={population.value.meta} /></div>
          </>
        ) : population.ok ? (
          <p className="text-muted">This data release has no population figures.</p>
        ) : (
          <ErrorState title="The population figure can't be shown" error={plainError(population.error)} />
        )}
      </section>

      <section aria-labelledby="s-findings" className="summary-block mt-3">
        <h2 id="s-findings" className="text-base font-semibold text-ink">The strongest findings this week</h2>
        {!insights.ok ? (
          <ErrorState title="The findings can't be shown" error={plainError(insights.error)} />
        ) : findings.length === 0 ? (
          <p className="text-muted">No finding passed its statistical check in this data release.</p>
        ) : (
          <>
            <ol className="mt-1 space-y-1.5" data-testid="summary-findings">
              {findings.map((f) => (
                <li key={f.insight_id} className="grid grid-cols-[6.5rem_1fr] gap-3" data-testid="summary-finding">
                  <span className="font-semibold tabular-nums text-ink">
                    {f.display.value_text}{f.display.unit_text ? ` ${f.display.unit_text}` : ""}
                  </span>
                  <span className="text-ink">
                    <Glossed text={f.headline} />
                    <span className="block text-xs text-muted">
                      <span data-testid="summary-metric">The number: <Glossed text={lowerFirst(f.display.metric_label)} plain /></span>.{" "}
                      Uses data to <time dateTime={f.as_of}>{formatAsOf(f.as_of)}</time>.
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-1 text-xs text-muted"><Glossed text={BED_WAIT_SHORT} /></p>
            <div className="text-xs text-muted"><AsOfLine asOf={findingsMeta!.as_of} meta={findingsMeta!} bySource /></div>
          </>
        )}
      </section>

      <section aria-labelledby="s-areas" className="summary-block mt-3">
        <h2 id="s-areas" className="text-base font-semibold text-ink">Areas with the least clinic access for seniors</h2>
        {areaError || !areas.ok ? (
          <ErrorState title="The areas can't be shown" error={plainError(areaError ?? { message: "" })} />
        ) : rows.length === 0 ? (
          <p className="text-muted">No area passed the access check in this data release.</p>
        ) : (
          <>
            <p className="text-muted">
              <Glossed text="The priority areas from this week's findings: many residents aged 65+, few CDMP GP clinics per senior." />
            </p>
            <table className="mt-1 w-full text-left tabular-nums" data-testid="summary-areas">
              <thead className="text-xs text-muted">
                <tr>
                  <th scope="col" className="py-1 pr-2 font-medium">Rank</th>
                  <th scope="col" className="py-1 pr-2 font-medium">Area</th>
                  <th scope="col" className="py-1 pr-2 text-right font-medium">Residents aged 65+</th>
                  <th scope="col" className="py-1 pr-2 text-right font-medium"><Glossed text="CDMP clinics per 1,000 aged 65+" plain /></th>
                  <th scope="col" className="py-1 text-right font-medium">Clinics short of the national rate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name} className="border-t border-line" data-testid="summary-area">
                    <td className="py-1 pr-2">{r.rank}</td>
                    <th scope="row" className="py-1 pr-2 font-medium text-ink">{r.name}</th>
                    <td className="py-1 pr-2 text-right">{r.seniors == null ? MISSING : r.seniors.toLocaleString("en-SG")}</td>
                    <td className="py-1 pr-2 text-right">{r.rate == null ? MISSING : r.rate.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-1 text-right">{r.shortfall == null ? MISSING : `about ${Math.round(r.shortfall)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-xs text-muted"><AsOfLine asOf={areas.value.meta.as_of} meta={areas.value.meta} /></div>
          </>
        )}
      </section>

      <section aria-labelledby="s-limits" className="summary-block mt-3" data-testid="summary-limits">
        <h2 id="s-limits" className="text-base font-semibold text-ink">What this data can&apos;t show</h2>
        <div className="doc doc-tight">{limits.content}</div>
      </section>

      <footer className="mt-3 border-t border-line pt-2 text-xs text-muted">
        <Glossed text="Aggregate public data only. No personal or patient-level data. Findings describe patterns, not their causes." />{" "}
        Methods and every limit: <Link href="/methodology">the methodology</Link>.
      </footer>
    </article>
  );
}
