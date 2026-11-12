import Link from "next/link";

import { CaveatChip } from "@/components/CaveatChip";
import { Glossed } from "@/components/terms/Glossed";
import type { Insight, Meta } from "@/lib/api/types";
import { selectCallouts, STRENGTH_SYMBOL } from "@/lib/callouts";
import { formatAsOf } from "@/lib/dates";
import { findingMeta, sourceDates } from "@/lib/provenance";

/** The finding's own date range, e.g. "27 Apr 2026 to 25 Oct 2026" ("25 Oct 2026" for one day). */
function periodText(i: Insight): string | null {
  if (!i.period_start || !i.period_end) return null;
  return i.period_start === i.period_end ? formatAsOf(i.period_end) : `${formatAsOf(i.period_start)} to ${formatAsOf(i.period_end)}`;
}

function Callout({ insight, meta }: { insight: Insight; meta: Meta }) {
  const m = findingMeta(insight, meta);
  const dates = sourceDates(m.sources);
  const period = periodText(insight);
  const caveat = insight.caveats[0] ?? null;
  const href = insight.headline_rank ? `/findings#${insight.insight_id}` : "/findings#findings";
  return (
    <li className="rounded-md border border-line bg-page p-3" data-testid="callout" data-insight={insight.insight_id}>
      <p className="text-sm text-ink" data-testid="callout-text"><Glossed text={insight.headline} /></p>
      <p className="mt-1 text-xs text-muted" data-testid="callout-strength">
        <span aria-hidden="true">{insight.strength ? STRENGTH_SYMBOL[insight.strength] : ""}</span>{" "}
        {insight.strength ? `Strength: ${insight.strength}` : "Strength not rated"}
        {insight.p_adjusted == null ? " · A plain comparison, not a statistical test" : ""}
      </p>
      {caveat ? <div className="mt-2"><CaveatChip><Glossed text={caveat} /></CaveatChip></div> : null}
      <p className="mt-2 text-xs text-muted" data-testid="callout-provenance">
        Data as of {dates.length ? dates.map((d) => `${formatAsOf(d.asOf)} (${d.name})`).join(", ") : formatAsOf(insight.as_of)}
        {period ? ` · Uses data from ${period}` : ""}
        {" · "}<Link href={href}>Read the finding</Link>
      </p>
    </li>
  );
}

/**
 * Short findings above a chart: at most two, strongest first, the rest behind "More findings". Everything shown,
 * the sentence, its strength, its caveat and its dates, comes from the insight engine through the API; nothing is
 * written here. Renders nothing when no finding applies, so a quiet week leaves the chart as it is.
 */
export function Callouts({ insights, types, codes, meta, label }: {
  insights: Insight[]; types: Insight["type"][]; codes: string[]; meta: Meta; label: string;
}) {
  const { shown, more } = selectCallouts(insights, types, codes);
  if (!shown.length) return null;
  return (
    <section aria-label={`Findings: ${label}`} className="mb-4" data-testid="callouts">
      <ul className="space-y-2">
        {shown.map((i) => <Callout key={i.insight_id} insight={i} meta={meta} />)}
      </ul>
      {more.length ? (
        <details className="mt-2" data-testid="callouts-more">
          <summary className="cursor-pointer text-sm text-accent underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
            More findings ({more.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {more.map((i) => <Callout key={i.insight_id} insight={i} meta={meta} />)}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
