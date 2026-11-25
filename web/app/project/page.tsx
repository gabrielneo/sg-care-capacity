import type { Metadata } from "next";
import Link from "next/link";
import { SectionCrumb } from "@/components/SectionCrumb";
import type { ReactNode } from "react";

import { Missing } from "@/components/Missing";
import { Section } from "@/components/Section";

import { Provenance } from "@/components/Provenance";
import { Glossed } from "@/components/terms/Glossed";
import { api, settle } from "@/lib/api/client";
import { AUTHOR, AUTHOR_LINKS, BUILD_FACTS, WHAT_I_DID } from "@/lib/author";
import { MonthLine } from "@/components/charts/MonthLine";
import { provenanceText } from "@/components/Provenance";
import { fromSystem, latestComplete, MONTHS_LONG, timeSeries } from "@/lib/monthly";
import { checksBreakdown, checksSummary, findingTiles, shareText } from "@/lib/project";

export const metadata: Metadata = {
  title: "The project",
  description: "A public-data analytics project by Gabriel Neo: which public hospitals take longest to find admitted patients a ward bed, and where seniors have the fewest GP clinics.",
};
export const dynamic = "force-dynamic"; // rendered per request; API responses are cached for an hour

function Tile({ className = "", label, children, testId }: { className?: string; label: string; children: ReactNode; testId?: string }) {
  return (
    <section aria-label={label} data-testid={testId} className={`flex flex-col rounded-xl border border-line bg-surface card ${className}`}>
      {children}
    </section>
  );
}

/** A tile's heading: plain sentence case, no number or all-caps label above it (critique, 20 Nov 2026). */
const TileHeading = ({ children }: { children: ReactNode }) => <h2 className="text-small font-semibold text-muted">{children}</h2>;
const BigNumber = ({ children }: { children: ReactNode }) => (
  <p className="mt-2 text-kpi font-semibold tabular-nums tracking-tight text-ink">{children}</p>
);

/**
 * The project's front door, for someone who arrives from a CV or LinkedIn link: who built it, the three
 * headline findings, the proof the numbers are checked, and the way into the tools. Every figure comes from
 * the API (the insight engine, the population series, the latest data-quality run); the only numbers written in
 * code are the engineering facts in lib/author.ts, which a test checks against the README.
 */
export default async function ProjectPage() {
  const [insights, hospitals, population, quality, monthlyRes] = await Promise.all([
    settle(api.insights({ headline: true })),
    settle(api.hospitals()),
    settle(api.population()),
    settle(api.quality()),
    settle(api.edSystemMonthly({ months: 36 })),
  ]);
  // A live piece of the product instead of a screenshot: the landing page's monthly bed-wait line, from the same API call.
  const monthly = monthlyRes.ok ? monthlyRes.value.data.map(fromSystem) : [];
  const newest = latestComplete(monthly);
  const line = timeSeries(monthly, "wait");
  const newestName = newest ? `${MONTHS_LONG[newest.month - 1]} ${newest.year}` : "";
  const showLine = monthlyRes.ok && newest?.wait != null && line.some((p) => p.value != null);
  const findings = insights.ok ? findingTiles(insights.value.data, hospitals.ok ? hospitals.value.data : []) : [];
  const share = population.ok ? shareText(population.value.data) : null;
  const checks = quality.ok ? checksSummary(quality.value.data) : null;
  const link = (id: string) => AUTHOR_LINKS.find((l) => l.id === id);
  const [cv, linkedin, github] = [link("cv"), link("linkedin"), link("github")];

  return (
    <div data-testid="project">
      <SectionCrumb section="About" href="/about" page="The project in 60 seconds" />
      <header className="max-w-3xl pb-6 pt-2 sm:pt-4">
        <p className="text-small text-muted">A public-data analytics project by {AUTHOR.name}</p>
        <h1 className="mt-2 font-semibold tracking-tight text-ink text-h1">
          I built a checked view of hospital bed waits, and of clinic access for Singapore&apos;s seniors.
        </h1>
        <p className="mt-3 text-body text-muted">{AUTHOR.seeking}</p>
        <p className="mt-4 flex flex-wrap gap-3">
          {cv ? (
            <a href={cv.href} target="_blank" rel="noopener noreferrer"
               className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-small font-semibold text-on-primary no-underline hover:bg-primary-strong">
              Read my CV<span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
          {linkedin ? (
            <a href={linkedin.href} target="_blank" rel="noopener noreferrer"
               className="inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-4 text-small font-semibold text-ink no-underline hover:bg-page">
              Connect on LinkedIn<span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
        </p>
      </header>

      {showLine && monthlyRes.ok ? (
        <figure className="mb-8 max-w-3xl rounded-xl border border-line bg-surface p-4 sm:p-6" data-testid="project-live">
          <figcaption className="text-small font-semibold text-ink">From the live site: average bed wait at the full emergency departments, month by month</figcaption>
          <MonthLine points={line} summary={`The average bed wait at the full emergency departments, by month, in hours: ${newestName} was ${newest?.wait?.toFixed(1)} hours.`} />
          <p className="mt-1 flex flex-wrap justify-between gap-x-4 text-meta text-muted">
            <span>{monthlyRes.value.meta ? provenanceText(monthlyRes.value.meta) : null}</span>
            <span className="font-semibold text-ink">{newestName}: {newest?.wait?.toFixed(1)} hours</span>
          </p>
          <p className="mt-2 text-small"><Link href="/">Open the site</Link></p>
        </figure>
      ) : null}

      <Section tone="band">
      <div className="card-grid sm:grid-cols-2 lg:grid-cols-4" data-testid="project-tiles">
        <Tile label="The problem" testId="project-context">
          <TileHeading>The problem</TileHeading>
          <BigNumber>{share ?? <Missing why="not available" />}</BigNumber>
          <p className="mt-1 flex-1 text-body text-ink">
            {share ? "of residents are 65 or over. This project asks where hospital and clinic capacity is under the most strain."
              : "The population figure can't be shown right now."}
          </p>
          {population.ok ? <div className="mt-3 text-meta text-muted"><Provenance meta={population.value.meta} compact /></div> : null}
        </Tile>

        {findings.map((f, i) => (
          <Tile key={f.insight_id} label={`Finding ${i + 1}`} testId="project-finding">
            {i === 0 ? <TileHeading>What the data shows</TileHeading> : <p aria-hidden="true" className="text-small">{"\u00a0"}</p>}
            <BigNumber>
              {f.display.value_text}
              {f.display.unit_text ? <span className="ml-2 text-h3 font-semibold text-muted">{f.display.unit_text}</span> : null}
            </BigNumber>
            <p className="mt-1 text-small text-muted"><Glossed text={f.display.metric_label} /></p>
            <p className="mt-3 flex-1 text-body text-ink"><Glossed text={f.headline} /></p>
            {f.action ? (
              <p className="mt-2 text-small text-muted" data-testid="project-action">
                Worth considering: <Glossed text={f.action} />{" "}
                <span className="block">The author&apos;s suggestion from public data, not any organisation&apos;s view.</span>
              </p>
            ) : null}
          </Tile>
        ))}
        {!insights.ok || !findings.length ? (
          <Tile label="Findings" className="sm:col-span-1 lg:col-span-3">
            <TileHeading>What the data shows</TileHeading>
            <p className="mt-2 text-body text-ink">
              {insights.ok ? "No finding passed its statistical check in this data release, so none is shown here." : "The findings can't be shown right now."}{" "}
              <Link href="/findings">Open the findings page</Link>
            </p>
          </Tile>
        ) : null}

        <Tile label="Why you can trust it" testId="project-build" className="sm:col-span-2 lg:col-span-4">
          <TileHeading>Why you can trust it</TileHeading>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            <div>
              <dt className="text-small text-muted">Data checks passed</dt>
              <dd className="text-kpi font-semibold tabular-nums text-ink" data-testid="project-checks">
                {checks ? `${checks.passed}/${checks.total}` : <Missing why="not available" />}
              </dd>
              {checks ? (
                <dd className="mt-1 text-small text-muted" data-testid="project-checks-note">
                  {checksBreakdown(checks) ? `${checksBreakdown(checks)}; ` : ""}
                  {checks.blocking === 0 ? "none blocks publishing" : `${checks.blocking} ${checks.blocking === 1 ? "blocks" : "block"} publishing`}.{" "}
                  <Link href="/data-quality">See every check</Link>
                </dd>
              ) : null}
            </div>
            <div>
              <dt className="text-small text-muted">Automated tests</dt>
              <dd className="text-kpi font-semibold tabular-nums text-ink">{BUILD_FACTS.tests}</dd>
            </div>
            <div>
              <dt className="text-small text-muted">Data release</dt>
              <dd className="text-kpi font-semibold text-ink">{BUILD_FACTS.cadence}</dd>
            </div>
            <div>
              <dt className="text-small text-muted">Numbers traced to raw data</dt>
              <dd className="text-kpi font-semibold tabular-nums text-ink">{BUILD_FACTS.auditSampled}</dd>
            </div>
          </dl>
          <ul className="mt-4 grid max-w-4xl list-disc gap-1 pl-6 text-body text-ink sm:grid-cols-3 sm:gap-x-8" data-testid="project-what-i-did">
            {WHAT_I_DID.map((line) => <li key={line}><Glossed text={line} /></li>)}
          </ul>
          <p className="mt-3 text-small">
            <Link href="/methodology">See how the figures are made</Link>
            {" · "}<a href={github?.href} target="_blank" rel="noopener noreferrer">Browse the code<span className="sr-only"> (opens in a new tab)</span></a>
          </p>
        </Tile>

        <Tile label="Try it" testId="project-tools" className="sm:col-span-2 lg:col-span-4">
          <TileHeading>Try it</TileHeading>
          <ul className="mt-2 grid gap-x-6 gap-y-1 text-body sm:grid-cols-2 lg:grid-cols-4">
            <li><Link href="/find">Find a clinic near you</Link></li>
            <li><Link href="/findings">Read the findings</Link></li>
            <li><Link href="/access-map">Explore the access map</Link></li>
            <li><Link href="/case-study">Read the case study</Link></li>
          </ul>
        </Tile>
      </div>
      </Section>
    </div>
  );
}
