import { Term } from "@/components/terms/Term";
import { TRIAGE_EMERGENCY, TRIAGE_GUIDANCE_LABEL, TRIAGE_GUIDANCE_URL, TRIAGE_NEXT } from "@/lib/copy";
import type { Density } from "@/lib/homeViews";

/**
 * The top of the home page on every view: the emergency line and "not medical advice".
 * - Full (the public view): the triage band comes first, can't be dismissed, and is the page's
 *   highest-contrast block. It says to call 995 and, in one line, that a GP clinic or polyclinic can
 *   often help when it isn't life-threatening, with a link to the official guidance. It gives no
 *   other medical advice. Then the page's heading and what the site is for.
 * - Simple (Planner, Analyst): one compact row.
 */
export function HomeNotice({ density = "full" }: { density?: Density }) {
  const full = density === "full";
  const notAdvice = (
    <p className={`${full ? "mt-3 text-base text-ink" : "text-sm text-muted"} max-w-prose`} data-testid="not-advice">
      This site shows public statistics. It isn&apos;t medical advice: if you&apos;re unsure where to go, ask a doctor or nurse.
    </p>
  );
  if (full) {
    return (
      <section aria-labelledby="home-title" className="pb-2" data-testid="home-hero" data-density={density}>
        <div role="note" aria-label="Emergency" className="rounded-xl bg-bad px-4 py-4 text-surface sm:px-6" data-testid="emergency-note">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-bold leading-tight">
            <span aria-hidden="true">✚</span>
            <span data-testid="triage-emergency">{TRIAGE_EMERGENCY}</span>
            <a href="tel:995" className="inline-flex min-h-11 items-center rounded-lg bg-surface px-4 text-lg font-bold text-bad no-underline hover:bg-bad-soft">
              Call 995
            </a>
          </p>
          <p className="mt-2 max-w-prose text-lg" data-testid="triage-next">
            {TRIAGE_NEXT}
            {TRIAGE_GUIDANCE_URL ? (
              <>{" "}<a href={TRIAGE_GUIDANCE_URL} className="font-semibold text-surface underline" data-testid="triage-link">{TRIAGE_GUIDANCE_LABEL}</a></>
            ) : null}
          </p>
        </div>
        <h1 id="home-title" className="mt-6 max-w-3xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Find a clinic near you
        </h1>
        <p className="mt-3 max-w-prose text-lg text-ink" data-testid="site-purpose">
          Not an emergency? A <Term id="gp" /> or <Term id="polyclinic">polyclinic</Term> is often the right place to start.
          Getting care in the most suitable place is called <Term id="right_siting">right-siting</Term>.
        </p>
        {notAdvice}
      </section>
    );
  }
  return (
    <section aria-labelledby="home-title" className="pb-0 pt-0" data-testid="home-hero" data-density={density}>
      <h1 id="home-title" className="max-w-4xl text-xl font-semibold tracking-tight text-ink sm:text-2xl">
        Hospital emergency departments: last week against a usual week
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p role="note" className="inline-flex max-w-prose items-center gap-2 rounded-lg border border-bad/30 bg-bad-soft px-3 py-1.5 text-sm font-medium text-bad"
           data-testid="emergency-note">
          <span aria-hidden="true">✚</span>
          In an emergency, call 995 or go to the nearest emergency department.
        </p>
        {notAdvice}
      </div>
    </section>
  );
}
