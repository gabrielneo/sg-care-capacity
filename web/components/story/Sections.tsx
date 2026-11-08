import Link from "next/link";
import type { ReactNode } from "react";

import type { Meta, PopulationYear } from "@/lib/api/types";
import { BED_WAIT_EXPLAINER, CAVEAT } from "@/lib/copy";
import { formatAsOf } from "@/lib/dates";
import { cadenceFor } from "@/lib/freshness";
import {
  ACTION_PENDING,
  chartFormat,
  chartTitle,
  monthYear,
  percentText,
  populationShare,
  primaryCaveat,
  type StoryInsight,
  whoActs,
} from "@/lib/story";

import { CaveatChip } from "../CaveatChip";
import { FreshnessBadge } from "../FreshnessBadge";
import { Provenance, publishers } from "../Provenance";
import { Glossed } from "../terms/Glossed";
import { Term } from "../terms/Term";
import { AnnotatedChart, fromInsightChart } from "./AnnotatedChart";
import { CountUp } from "./CountUp";
import { DeltaNumber, deltaFromDisplay } from "./DeltaNumber";
import { HighlightPhrase } from "./HighlightPhrase";
import { Scrolly } from "./Scrolly";

const NUMBER_WORDS = ["no", "one", "two", "three"];

/** Data as of {date} · Source: {publishers}, for figures outside a chart card. */
export function AsOfLine({ asOf, meta }: { asOf: string; meta: Meta }) {
  return (
    <p data-testid="provenance-line">
      Data as of <time dateTime={asOf}>{formatAsOf(asOf)}</time>
      {" · Source: "}
      {publishers(meta.sources).map((p, i) => (
        <span key={p.name}>
          {i > 0 ? ", " : null}
          <span title={p.full}><Glossed text={p.name} /></span>
        </span>
      ))}
    </p>
  );
}

/** 1. The top finding's key number, counting up once, and its headline. */
export function Hero({ insight, meta }: { insight: StoryInsight; meta: Meta }) {
  const d = insight.display;
  const spoken = d.unit_text ? `${d.value_text} ${d.unit_text}` : d.value_text;
  return (
    <header className="pb-10 pt-2 sm:pt-6" data-testid="hero">
      <p className="text-sm font-medium text-accent">The top finding in this week&apos;s data release</p>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-3 text-ink" data-testid="hero-number">
        <CountUp value={d.value_text} label={spoken} className="text-6xl font-semibold tracking-tight sm:text-7xl" />
        {d.unit_text ? <span className="text-2xl text-muted" aria-hidden="true">{d.unit_text}</span> : null}
      </p>
      <p className="mt-2 text-muted" data-testid="hero-label">
        <Glossed text={d.metric_label} />
        {d.comparison_label ? <>{" · vs "}<Glossed text={d.comparison_label} /></> : null}
      </p>
      <h1 className="mt-5 max-w-3xl text-2xl font-semibold leading-snug tracking-tight text-ink sm:text-3xl">
        <Glossed text={insight.headline} />
      </h1>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
        <FreshnessBadge asOf={insight.as_of} cadence={cadenceFor(meta)} />
        <AsOfLine asOf={insight.as_of} meta={meta} />
      </div>
    </header>
  );
}

/** 2. Why now: the share of residents aged 65+. One year of data is one figure: no trend is drawn. */
export function WhyNow({ years, meta }: { years: PopulationYear[]; meta: Meta }) {
  const share = populationShare(years);
  return (
    <section aria-labelledby="why-now" className="border-t border-line py-10" data-testid="why-now">
      <h2 id="why-now" className="text-xl font-semibold text-ink">Why now</h2>
      {share ? (
        <>
          <p className="mt-3 max-w-3xl text-2xl leading-snug text-ink">
            <HighlightPhrase>
              <span className="font-semibold tabular-nums" data-testid="share-65">{percentText(share.latest.share_65plus)}</span>
            </HighlightPhrase>{" "}
            of Singapore residents were aged 65 or over in {monthYear(share.latest.reference_date)}.
          </p>
          <p className="mt-3 max-w-prose text-ink">
            That is {share.latest.residents_65plus.toLocaleString("en-SG")} of {share.latest.residents_total.toLocaleString("en-SG")}{" "}
            residents. This share is what defines a <Term id="super_aged">super-aged society</Term>.
            {share.earliest ? ` It was ${percentText(share.earliest.share_65plus)} in ${share.earliest.year}.` : null}
          </p>
          <div className="max-w-3xl">
            <Provenance meta={meta} caveat={CAVEAT.population} />
          </div>
        </>
      ) : (
        <p className="mt-3 text-muted">This data release has no population figures.</p>
      )}
    </section>
  );
}

function StepText({ insight, index, total }: { insight: StoryInsight; index: number; total: number }) {
  const who = whoActs(insight);
  const caveat = primaryCaveat(insight);
  return (
    <article className="story-card rounded-lg border border-line bg-surface p-5 shadow-sm" data-insight={insight.insight_id}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Finding {index + 1} of {total}</p>
      <h3 className="mt-1 text-lg font-semibold leading-snug text-ink" data-testid="step-headline">
        <Glossed text={insight.headline} />
      </h3>
      <DeltaNumber {...deltaFromDisplay(insight.display, insight.direction)} />
      <p className="text-ink" data-testid="step-detail"><Glossed text={insight.detail} /></p>
      {caveat ? (
        <div className="mt-3">
          <CaveatChip><Glossed text={caveat} /></CaveatChip>
        </div>
      ) : null}
      <p className="mt-3 text-sm text-ink" data-testid="who-acts">
        <span className="font-medium">Who acts: </span>
        {who ? (
          <>
            <Glossed text={who.who} />
            {who.action ? <>{". "}<Glossed text={who.action} /></> : null}
          </>
        ) : (
          <span className="text-muted">{ACTION_PENDING}</span>
        )}
      </p>
    </article>
  );
}

function StoryChart({ insight, meta, where }: { insight: StoryInsight; meta: Meta; where: "inline" | "panel" }) {
  return (
    <AnnotatedChart
      id={`${insight.insight_id}-${where}`}
      title={chartTitle(insight)}
      description={insight.chart.y_label}
      meta={{ ...meta, as_of: insight.as_of }}
      format={chartFormat(insight)}
      headingLevel={3}
      {...fromInsightChart(insight.chart)}
    />
  );
}

/** 3. The findings, one step per headline finding, with the chart panel. */
export function Findings({ insights, meta }: { insights: StoryInsight[]; meta: Meta }) {
  const n = insights.length;
  return (
    <section aria-labelledby="findings" className="border-t border-line py-10" data-testid="findings">
      <h2 id="findings" className="text-xl font-semibold text-ink">What the data shows</h2>
      <p className="mt-2 max-w-prose text-ink">
        The {NUMBER_WORDS[n] ?? n} strongest {n === 1 ? "finding" : "findings"} in this week&apos;s data release. Each was published only
        because it passed a fixed statistical check. <Link href="/docs/insights-method">How findings are tested</Link>
      </p>
      <p className="mb-6 mt-2 max-w-prose text-sm text-muted" data-testid="bed-wait-explainer"><Glossed text={BED_WAIT_EXPLAINER} /></p>
      {/* Without JavaScript the step can't drive the panel, so each chart sits under its step. */}
      <noscript>
        <style>{".story-inline{display:block!important}.story-panel{display:none!important}"}</style>
      </noscript>
      <Scrolly
        steps={insights.map((insight, i) => ({
          key: insight.insight_id,
          text: <StepText insight={insight} index={i} total={n} />,
          inlineChart: <StoryChart insight={insight} meta={meta} where="inline" />,
          panelChart: <StoryChart insight={insight} meta={meta} where="panel" />,
        }))}
      />
    </section>
  );
}

/** 4. What the data can't tell you: the case study's own list, rendered from docs/case_study.md. */
export function Limits({ list }: { list: ReactNode }) {
  return (
    <section aria-labelledby="limits" className="border-t border-line py-10" data-testid="limits">
      <h2 id="limits" className="text-xl font-semibold text-ink">What this data can&apos;t tell you</h2>
      <p className="mt-2 text-ink">
        From the <Link href="/case-study#problem-statement">case study</Link>. The data can&apos;t show:
      </p>
      <div className="doc mt-2">{list}</div>
      <p className="text-sm">
        <Link href="/methodology#what-this-data-cant-tell-you">Every limit, in the methodology</Link>
      </p>
    </section>
  );
}

export interface DepthCard {
  budget: string;
  title: string;
  text: string;
  href: string;
  estimate: string;
}

/** 5. Where to go next, by how much time the reader has. */
export function DepthCards({ cards }: { cards: DepthCard[] }) {
  return (
    <section aria-labelledby="depth" className="border-t border-line py-10" data-testid="depth">
      <h2 id="depth" className="text-xl font-semibold text-ink">Go further</h2>
      <ul className="mt-4 grid gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <li key={c.href} data-testid="depth-card">
            <Link href={c.href} className="flex h-full flex-col rounded-lg border border-line bg-surface p-4 no-underline hover:border-accent">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">{c.budget}</span>
              <span className="mt-1 font-medium text-accent"><Glossed text={c.title} plain /> →</span>
              <span className="mt-1 flex-1 text-sm text-muted"><Glossed text={c.text} plain /></span>
              <span className="mt-3 text-xs text-muted" data-testid="depth-estimate">{c.estimate}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
