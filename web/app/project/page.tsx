import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Provenance } from "@/components/Provenance";
import { CountUp } from "@/components/story/CountUp";
import { Glossed } from "@/components/terms/Glossed";
import { api, settle } from "@/lib/api/client";
import { AUTHOR, AUTHOR_LINKS, BUILD_FACTS } from "@/lib/author";
import { checksSummary, findingTiles, shareText } from "@/lib/project";

export const metadata: Metadata = {
  title: "The project",
  description: "A public-data analytics project by Gabriel Neo: where Singapore's emergency departments wait longest for ward beds, and where seniors have the fewest clinics.",
};
export const dynamic = "force-dynamic"; // rendered per request; API responses are cached for an hour

function Tile({ className = "", label, children, testId }: { className?: string; label: string; children: ReactNode; testId?: string }) {
  return (
    <section aria-label={label} data-testid={testId} className={`flex flex-col rounded-xl border border-line bg-surface p-5 ${className}`}>
      {children}
    </section>
  );
}

const Eyebrow = ({ children }: { children: ReactNode }) => <p className="text-xs font-semibold uppercase tracking-wide text-muted">{children}</p>;
const BigNumber = ({ children }: { children: ReactNode }) => (
  <p className="mt-2 text-4xl font-semibold tabular-nums tracking-tight text-ink sm:text-5xl">{children}</p>
);

/**
 * The project's front door, for someone who arrives from a CV or LinkedIn link: who built it, the three
 * headline findings, the proof the numbers are checked, and the way into the tools. Every figure comes from
 * the API (the insight engine, the population series, the latest data-quality run); the only numbers written in
 * code are the engineering facts in lib/author.ts, which a test checks against the README.
 */
export default async function ProjectPage() {
  const [insights, population, quality] = await Promise.all([
    settle(api.insights({ headline: true })),
    settle(api.population()),
    settle(api.quality()),
  ]);
  const findings = insights.ok ? findingTiles(insights.value.data) : [];
  const share = population.ok ? shareText(population.value.data) : null;
  const checks = quality.ok ? checksSummary(quality.value.data) : null;
  const link = (id: string) => AUTHOR_LINKS.find((l) => l.id === id);
  const [cv, linkedin, github] = [link("cv"), link("linkedin"), link("github")];

  return (
    <div data-testid="project">
      <header className="max-w-3xl pb-6 pt-2 sm:pt-6">
        <Eyebrow>A public-data analytics project by {AUTHOR.name}</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Singapore is ageing fast. Where do hospital waits run longest, and where are clinics for seniors scarce?
        </h1>
        <p className="mt-3 text-base text-muted">{AUTHOR.seeking}</p>
        <p className="mt-4 flex flex-wrap gap-3">
          {cv ? (
            <a href={cv.href} target="_blank" rel="noopener noreferrer"
               className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-semibold text-surface no-underline hover:bg-accent-strong">
              Read my CV<span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
          {linkedin ? (
            <a href={linkedin.href} target="_blank" rel="noopener noreferrer"
               className="inline-flex min-h-11 items-center rounded-md border border-line bg-surface px-4 text-sm font-semibold text-ink no-underline hover:bg-page">
              Connect on LinkedIn<span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="project-tiles">
        <Tile label="The problem" testId="project-context">
          <Eyebrow>1 · The problem</Eyebrow>
          <BigNumber>{share ?? "–"}</BigNumber>
          <p className="mt-1 flex-1 text-base text-ink">
            {share ? "of residents are 65 or over. This project asks where hospital and clinic capacity is under the most strain."
              : "The population figure can't be shown right now."}
          </p>
          {population.ok ? <div className="mt-3 text-xs text-muted"><Provenance meta={population.value.meta} compact /></div> : null}
        </Tile>

        {findings.map((f, i) => (
          <Tile key={f.insight_id} label={`Finding ${i + 1}`} testId="project-finding">
            <Eyebrow>{i === 0 ? "2 · What the data shows" : "\u00a0"}</Eyebrow>
            <BigNumber>
              {i === 0 ? <CountUp value={f.display.value_text} label={f.display.value_text} /> : f.display.value_text}
              {f.display.unit_text ? <span className="ml-2 text-lg font-medium text-muted">{f.display.unit_text}</span> : null}
            </BigNumber>
            <p className="mt-1 text-sm text-muted"><Glossed text={f.display.metric_label} /></p>
            <p className="mt-3 flex-1 text-base text-ink"><Glossed text={f.headline} /></p>
            {f.action ? (
              <p className="mt-2 text-sm text-muted" data-testid="project-action">
                Worth considering: <Glossed text={f.action} />{" "}
                <span className="block">The author&apos;s suggestion from public data, not any organisation&apos;s view.</span>
              </p>
            ) : null}
          </Tile>
        ))}
        {!insights.ok || !findings.length ? (
          <Tile label="Findings" className="sm:col-span-1 lg:col-span-3">
            <Eyebrow>2 · What the data shows</Eyebrow>
            <p className="mt-2 text-base text-ink">
              {insights.ok ? "No finding passed its statistical check in this data release, so none is shown here." : "The findings can't be shown right now."}{" "}
              <Link href="/findings">Open the findings page</Link>
            </p>
          </Tile>
        ) : null}

        <Tile label="Why you can trust it" testId="project-build" className="sm:col-span-2 lg:col-span-4">
          <Eyebrow>3 · Why you can trust it</Eyebrow>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            <div>
              <dt className="text-sm text-muted">Data checks passed</dt>
              <dd className="text-3xl font-semibold tabular-nums text-ink" data-testid="project-checks">
                {checks ? `${checks.passed}/${checks.total}` : "–"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Automated tests</dt>
              <dd className="text-3xl font-semibold tabular-nums text-ink">{BUILD_FACTS.tests}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Data release</dt>
              <dd className="text-3xl font-semibold text-ink">{BUILD_FACTS.cadence}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Numbers traced to raw data</dt>
              <dd className="text-3xl font-semibold tabular-nums text-ink">{BUILD_FACTS.auditSampled}</dd>
            </div>
          </dl>
          <ul className="mt-4 grid max-w-4xl list-disc gap-1 pl-5 text-base text-ink sm:grid-cols-3 sm:gap-x-8" data-testid="project-what-i-did">
            <li><Glossed text="Built a weekly pipeline from MOH, data.gov.sg, SingStat and NUHS data." /></li>
            <li>Wrote checks that block a bad release, and a statistical test every finding must pass.</li>
            <li>Designed one site for three readers: the public, planners and analysts.</li>
          </ul>
          <p className="mt-3 text-sm">
            <Link href="/how-its-built">See how it&apos;s built</Link>
            {" · "}<a href={github?.href} target="_blank" rel="noopener noreferrer">Browse the code<span className="sr-only"> (opens in a new tab)</span></a>
          </p>
        </Tile>

        <Tile label="Try it" testId="project-tools" className="sm:col-span-2 lg:col-span-4">
          <Eyebrow>4 · Try it</Eyebrow>
          <ul className="mt-2 grid gap-x-6 gap-y-1 text-base sm:grid-cols-2 lg:grid-cols-4">
            <li><Link href="/">Find a clinic near you</Link></li>
            <li><Link href="/findings">Read the findings</Link></li>
            <li><Link href="/access-map">Explore the access map</Link></li>
            <li><Link href="/case-study">Read the case study</Link></li>
          </ul>
        </Tile>
      </div>
    </div>
  );
}
