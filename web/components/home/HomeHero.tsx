
import { Notice995 } from "@/components/Notice995";
import { Term } from "@/components/terms/Term";
import { Prose } from "@/components/Prose";
import { Glossed } from "@/components/terms/Glossed";
import { BED_WAIT_INTRO } from "@/lib/copy";
import type { Density } from "@/lib/homeViews";

/**
 * The top of the home page on every view.
 * - Full (the public view): the page's heading, what the site is for and "not medical advice". It has no red 995 banner (removed at
 *   the owner's request, 16 Nov 2026); the emergency number stays in the footer of every page and in the menu sheet.
 * - Simple (Planner, Analyst): the heading, then one compact line (components/Notice995.tsx). The Analyst and Planner views have no CV or LinkedIn line.
 */
export function HomeNotice({ density = "full", printHref }: { density?: Density; printHref?: string }) {
  const full = density === "full";
  const notAdvice = (
    <p className={`${full ? "mt-2 text-small text-ink sm:mt-3 sm:text-body" : "text-small text-muted"} max-w-prose`} data-testid="not-advice">
      This site shows public statistics. It isn&apos;t medical advice: if you&apos;re unsure where to go, ask a doctor or nurse.
    </p>
  );
  if (full) {
    return (
      <section aria-labelledby="home-title" data-testid="home-hero" data-density={density}>
        <h1 id="home-title" className="mt-2 max-w-3xl font-semibold tracking-tight text-ink sm:mt-4 text-h1">
          Find a clinic near you
        </h1>
        <p className="mt-2 max-w-prose text-body text-ink sm:mt-3" data-testid="site-purpose">
          Not an emergency? A <Term id="gp" /> or <Term id="polyclinic">polyclinic</Term> is often the right place to start.
          Getting care in the most suitable place is called <Term id="right_siting">right-siting</Term>.
        </p>
        {notAdvice}
      </section>
    );
  }
  return (
    <section aria-labelledby="home-title" className="pb-0 pt-0" data-testid="home-hero" data-density={density}>
      <h1 id="home-title" className="max-w-4xl font-semibold text-ink text-h2">
        Hospital emergency departments: the latest complete week against a usual week
      </h1>
      <Notice995 variant="compact" className="mt-2" />
      <Prose size="small" tone="muted" className="mt-2" data-testid="bed-wait-definition"><Glossed text={BED_WAIT_INTRO} /></Prose>
      {printHref ? (
        <p className="print-hide mt-2 text-small">
          <a href={printHref} data-testid="print-summary-link" className="inline-flex min-h-11 items-center">Print summary</a>
        </p>
      ) : null}
      {/* The end of the page's intro: the sticky status strip appears once this has scrolled out of view (components/SiteStrip.tsx). */}
      <div data-strip-sentinel="" aria-hidden="true" />
    </section>
  );
}
