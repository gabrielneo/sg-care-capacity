import Link from "next/link";
import type { ReactNode } from "react";

import type { Meta, PopulationYear } from "@/lib/api/types";
import { AVERAGE_VS_TYPICAL, BED_WAIT_EXPLAINER, CAVEAT, CITIZENS_SUPER_AGED, SITE_SCOPE } from "@/lib/copy";
import { term } from "@/lib/glossary";
import { formatAsOf } from "@/lib/dates";
import { findingMeta, sharedFindingMeta, sourceDates } from "@/lib/provenance";
import {
  monthYear,
  percentText,
  populationShare,
  type StoryInsight,
} from "@/lib/story";

import { FreshnessBadge } from "../FreshnessBadge";
import { Provenance, publishers } from "../Provenance";
import { Glossed } from "../terms/Glossed";
import { Term } from "../terms/Term";
import { FindingBand } from "./FindingBand";
import { SITE } from "@/lib/site";
import { HighlightPhrase } from "./HighlightPhrase";

const NUMBER_WORDS = ["no", "one", "two", "three"];
const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/**
 * Data as of {date} · Source: {publishers}, for figures outside a chart card. bySource gives each
 * publisher's own date; findingTo adds the finding's data window (see Provenance).
 */
export function AsOfLine({ asOf, meta, bySource = false, findingTo }: { asOf: string; meta: Meta; bySource?: boolean;
                                                                       findingTo?: string | null }) {
  const perSource = bySource ? sourceDates(meta.sources) : [];
  const dates = perSource.length > 1 ? perSource : [{ name: "", asOf }];
  return (
    <p data-testid="provenance-line">
      Data as of{" "}
      {dates.map((d, i) => (
        <span key={d.name || "all"}>
          {i > 0 ? " and " : null}
          <time dateTime={d.asOf}>{formatAsOf(d.asOf)}</time>
          {d.name ? ` (${d.name})` : null}
        </span>
      ))}
      {" · Source: "}
      {publishers(meta.sources).map((p, i) => (
        <span key={p.name}>
          {i > 0 ? ", " : null}
          <span title={p.full}><Glossed text={p.name} /></span>
        </span>
      ))}
      {findingTo ? (
        <span data-testid="finding-window">
          {" · This finding uses data to "}<time dateTime={findingTo}>{formatAsOf(findingTo)}</time>
        </span>
      ) : null}
    </p>
  );
}

/** 1. The page's opening: the title, one sentence, and the data's date. The top finding is Finding 1 below, not repeated here. */
export function Hero({ insight, meta, count }: { insight: StoryInsight; meta: Meta; count: number }) {
  const own = findingMeta(insight, meta);       // dated by its sources, not by the end of its window
  return (
    <header className="pb-8 pt-2 sm:pt-6" data-testid="hero">
      <h1 className="max-w-3xl font-semibold leading-snug tracking-tight text-ink text-h1">Findings from the latest data release</h1>
      <p className="mt-3 max-w-prose text-body text-ink" data-testid="hero-summary">
        {count === 1 ? "One finding" : `${NUMBER_WORDS[count] ? NUMBER_WORDS[count]!.charAt(0).toUpperCase() + NUMBER_WORDS[count]!.slice(1) : count} findings`}{" "}
        on emergency department bed waits and clinic access for seniors, each published only after a fixed statistical check.
      </p>
      <p className="mt-3 max-w-prose text-small text-muted" data-testid="site-purpose">
        <strong className="font-semibold text-ink">{SITE.name}</strong> looks at <Glossed text="right-siting" />:{" "}
        <Glossed text={lowerFirst(term("right_siting").plain_definition)} /> <Glossed text={SITE_SCOPE} />
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-small text-muted">
        <FreshnessBadge meta={own} dateInLine />
        <AsOfLine asOf={own.as_of} meta={own} bySource findingTo={insight.as_of} />
      </div>
    </header>
  );
}

/** 2. Why now: the share of residents aged 65+. One year of data is one figure: no trend is drawn. */
export function WhyNow({ years, meta }: { years: PopulationYear[]; meta: Meta }) {
  const share = populationShare(years);
  return (
    <section aria-labelledby="why-now" className="border-t border-line py-8" data-testid="why-now">
      <h2 id="why-now" className="font-semibold text-ink text-h2">Why now</h2>
      {share ? (
        <>
          <p className="mt-3 max-w-3xl text-h2 leading-snug text-ink">
            <HighlightPhrase>
              <span className="font-semibold tabular-nums" data-testid="share-65">{percentText(share.latest.share_65plus)}</span>
            </HighlightPhrase>{" "}
            of Singapore residents were aged 65 or over in {monthYear(share.latest.reference_date)}.
          </p>
          <p className="mt-3 max-w-prose text-ink">
            That is {share.latest.residents_65plus.toLocaleString("en-SG")} of {share.latest.residents_total.toLocaleString("en-SG")}{" "}
            residents (citizens and permanent residents). A <Term id="super_aged">super-aged society</Term> is{" "}
            {lowerFirst(term("super_aged").plain_definition).replace(/^a society /, "one ").replace(/\.$/, "")}.{" "}
            {CITIZENS_SUPER_AGED} (<a href={term("super_aged").source_url ?? undefined}>population.gov.sg</a>).
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

/** 3. The findings, one band each, alternating page and band like chapters. */
export function Findings({ insights, meta }: { insights: StoryInsight[]; meta: Meta }) {
  const n = insights.length;
  // Once per section: one date and source line here when every finding shares them; each chart then inherits it.
  const shared = sharedFindingMeta(insights, meta);
  return (
    <section aria-labelledby="findings" className="pt-8" data-testid="findings">
      <h2 id="findings" className="font-semibold text-ink text-h2">What does the data show?</h2>
      <p className="mt-2 max-w-prose text-ink">
        The {NUMBER_WORDS[n] ?? n} strongest {n === 1 ? "finding" : "findings"} in this week&apos;s data release.{" "}
        <Link href="/docs/insights-method">How findings are tested</Link>
        {" · "}<a href="/export/findings.csv" download data-testid="csv-download">Download every finding (CSV)</a>
        {" · "}<Link href="/summary" data-testid="summary-link">One-page summary to print</Link>
      </p>
      <p className={`${shared ? "" : "mb-6 "}mt-2 max-w-prose text-small text-muted`} data-testid="bed-wait-explainer">
        <Glossed text={BED_WAIT_EXPLAINER} /> <span data-testid="average-vs-typical">{AVERAGE_VS_TYPICAL}</span>
      </p>
      {shared ? (
        <div className="mb-6 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-small text-muted" data-testid="section-meta">
          <FreshnessBadge meta={shared} dateInLine />
          <AsOfLine asOf={shared.as_of} meta={shared} bySource />
        </div>
      ) : null}
      {insights.map((insight, i) => (
        <FindingBand key={insight.insight_id} insight={insight} index={i} total={n} meta={meta} section={shared}
                     tone={i % 2 === 0 ? "band" : "page"} />
      ))}
    </section>
  );
}

/** 4. What the data can't tell you: the case study's own three limits, as a calm row of cards. */
export function Limits({ items }: { items: ReactNode[] }) {
  return (
    <section aria-labelledby="limits" className="section" data-testid="limits">
      <h2 id="limits" className="font-semibold text-ink text-h2">What can&apos;t this data tell you?</h2>
      <p className="mt-2 max-w-prose text-ink">
        From the <Link href="/case-study#problem-statement">case study</Link>. The data can&apos;t show:
      </p>
      <ul className="mt-4 card-grid md:grid-cols-3">
        {items.map((item, i) => (
          <li key={i} className="doc rounded-lg border border-line bg-sunken card text-small" data-testid="limit-card">
            <span aria-hidden="true" className="text-meta font-semibold text-muted">{i + 1}</span>
            {item}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-small"><Link href="/methodology#what-this-data-cant-tell-you">Every limit, in the methodology</Link></p>
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
    <section aria-labelledby="depth" className="border-t border-line py-8" data-testid="depth">
      <h2 id="depth" className="font-semibold text-ink text-h2">Go further</h2>
      <ul className="mt-4 card-grid md:grid-cols-3">
        {cards.map((c) => (
          <li key={c.href} data-testid="depth-card" className="flex h-full flex-col rounded-lg border border-line bg-surface card">
            <p className="text-meta font-semibold uppercase tracking-wide text-muted">{c.budget}</p>
            <Link href={c.href} className="mt-1 inline-flex min-h-11 items-center font-semibold"><Glossed text={c.title} plain />{" "}→</Link>
            <p className="flex-1 text-small text-muted"><Glossed text={c.text} plain /></p>
            <p className="mt-3 text-meta text-muted" data-testid="depth-estimate">{c.estimate}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
