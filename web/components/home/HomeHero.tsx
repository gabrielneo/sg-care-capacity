
import { Notice995 } from "@/components/Notice995";
import { Term } from "@/components/terms/Term";
import { TRIAGE_EMERGENCY, TRIAGE_GUIDANCE_LABEL, TRIAGE_GUIDANCE_URL, TRIAGE_NEXT } from "@/lib/copy";
import type { Density } from "@/lib/homeViews";

/**
 * The top of the home page on every view: the emergency line and "not medical advice".
 * - Full (the public view): the triage band comes first, can't be dismissed, and is the page's
 *   highest-contrast block. It says to call 995 and, in one line, that a GP clinic or polyclinic can
 *   often help when it isn't life-threatening, with a link to the official guidance. It gives no
 *   other medical advice. Then the page's heading and what the site is for.
 * - Simple (Planner, Analyst): the heading, then one compact line (components/Notice995.tsx). The Analyst and Planner views have no CV or LinkedIn line.
 */
export function HomeNotice({ density = "full" }: { density?: Density }) {
  const full = density === "full";
  const notAdvice = (
    <p className={`${full ? "mt-2 text-small text-ink sm:mt-3 sm:text-body" : "text-small text-muted"} max-w-prose`} data-testid="not-advice">
      This site shows public statistics. It isn&apos;t medical advice: if you&apos;re unsure where to go, ask a doctor or nurse.
    </p>
  );
  if (full) {
    return (
      <section aria-labelledby="home-title" data-testid="home-hero" data-density={density}>
        <div role="note" aria-label="Emergency" className="rounded-xl bg-danger px-4 py-3 text-surface sm:px-6 sm:py-4" data-testid="emergency-note">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-h3 font-semibold leading-tight sm:text-h2">
            <span aria-hidden="true">✚</span>
            <span data-testid="triage-emergency">{TRIAGE_EMERGENCY}</span>
            <a href="tel:995" className="inline-flex min-h-11 items-center rounded-lg bg-surface px-4 text-h3 font-semibold text-danger no-underline hover:bg-danger-soft">
              Call 995
            </a>
          </p>
          <p className="mt-2 max-w-prose text-small sm:text-body" data-testid="triage-next">
            {TRIAGE_NEXT}
            {TRIAGE_GUIDANCE_URL ? (
              <>{" "}<a href={TRIAGE_GUIDANCE_URL} className="font-semibold text-surface underline" data-testid="triage-link">{TRIAGE_GUIDANCE_LABEL}</a></>
            ) : null}
          </p>
        </div>
        <h1 id="home-title" className="mt-3 max-w-3xl font-semibold tracking-tight text-ink sm:mt-6 text-h1">
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
      {/* The end of the page's intro: the sticky status strip appears once this has scrolled out of view (components/SiteStrip.tsx). */}
      <div data-strip-sentinel="" aria-hidden="true" />
    </section>
  );
}
