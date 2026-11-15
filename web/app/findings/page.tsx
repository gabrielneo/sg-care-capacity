import type { Metadata } from "next";

import { JumpMenu } from "@/components/JumpMenu";
import { OnThisPage } from "@/components/OnThisPage";
import { FigureCadenceNote } from "@/components/FigureCadenceNote";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState } from "@/components/States";
import { type DepthCard, DepthCards, Findings, Hero, Limits, WhyNow } from "@/components/story/Sections";
import { api, settle } from "@/lib/api/client";
import { plainError } from "@/lib/copy";
import { docWords, renderDocListItems } from "@/lib/docs";
import { EMPTY_STORY, emptyReason, readingMinutes, storySteps } from "@/lib/story";
import { SITE_TITLE } from "@/lib/site";

export const metadata: Metadata = { title: "Findings" };
export const dynamic = "force-dynamic"; // rendered per request; API responses are cached for an hour

const LIMITS_MARKER = "**What the data can't show**";

/**
 * Findings, as a scroll story (the site's home page until 2026-11-09; the home page now leads
 * with status and clinics, and links here for the full findings). Every finding's text and number comes from /api/v1/insights
 * (the insight engine); the population figure from /api/v1/population; the limits from
 * docs/case_study.md. This file writes none of them.
 */
export default async function FindingsPage() {
  const [insights, hospitals, population, limits, problemWords, methodWords] = await Promise.all([
    settle(api.insights({ headline: true })),
    settle(api.hospitals()),
    settle(api.population()),
    renderDocListItems("case_study.md", LIMITS_MARKER),
    docWords("case_study.md", "Problem statement"),
    docWords("insights_method.md"),
  ]);
  const steps = insights.ok ? storySteps(insights.value.data, hospitals.ok ? hospitals.value.data : []) : [];
  const top = steps[0];

  const cards: DepthCard[] = [
    { budget: "Got 30 seconds?", title: "Look up one hospital", href: "/ed-trends", estimate: "30 seconds",
      text: "Pick a hospital on ED Trends to see its daily bed waits and ED visits." },
    { budget: "Got 3 minutes?", title: "The problem this project looks at", href: "/case-study#problem-statement",
      estimate: `About ${readingMinutes(problemWords)} min read`,
      text: "The case study's problem statement: what the data shows, and what it can't." },
    { budget: "Deep dive", title: "How findings are tested", href: "/docs/insights-method",
      estimate: `About ${readingMinutes(methodWords)} min read`,
      text: "Every method, threshold and check behind the findings on this page." },
  ];

  // The sections that are on the page, in order: the list and the menu name only these.
  const stops = [
    ...(population.ok ? [{ id: "why-now", label: "Why now" }] : []),
    ...(insights.ok && steps.length ? [{ id: "findings", label: "What does the data show?" }] : []),
    { id: "limits", label: "What can't this data tell you?" },
    { id: "depth", label: "Go further" },
  ];

  const page = (
    <>
      {!insights.ok ? (
        <>
          <PageHeader title={SITE_TITLE} />
          <ErrorState error={plainError(insights.error)} />
        </>
      ) : top ? (
        <Hero insight={top} meta={insights.value.meta} count={steps.length} />
      ) : (
        <>
          <PageHeader title={SITE_TITLE} />
          <EmptyState title="No findings to show" message={EMPTY_STORY[emptyReason(insights.value.data)]} />
        </>
      )}

      {population.ok ? (
        <WhyNow years={population.value.data} meta={population.value.meta} />
      ) : insights.ok ? (
        // (If both calls failed, the error at the top already says so.)
        <section className="border-t border-line py-8">
          <ErrorState title="The population figure can't be shown" error={plainError(population.error)} />
        </section>
      ) : null}

      {insights.ok && steps.length ? <Findings insights={steps} meta={insights.value.meta} /> : null}

      <div className="mx-auto max-w-3xl pt-6"><FigureCadenceNote kind="findings" /></div>
      <Limits items={limits} />
      <DepthCards cards={cards} />
    </>
  );

  return (
    <div className="rail-layout">
      <div className="min-w-0">
        <JumpMenu items={stops} className="mb-3 xl:hidden" />
        {page}
      </div>
      <aside className="rail" aria-label="Page contents"><OnThisPage items={stops} /></aside>
    </div>
  );
}
