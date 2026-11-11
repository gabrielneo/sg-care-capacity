import { Term } from "@/components/terms/Term";

/**
 * The first screen: what the site is for, the emergency line, and the postcode search. The search
 * is a plain GET form (/?near=...), so it works without JavaScript and the result is a shareable link.
 */
export function HomeHero({ near }: { near: string }) {
  return (
    <section aria-labelledby="home-title" className="pb-6 pt-2 sm:pt-6" data-testid="home-hero">
      <h1 id="home-title" className="max-w-3xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Check how busy hospital emergency departments are, and find a clinic near you
      </h1>
      <p className="mt-3 max-w-prose text-lg text-muted" data-testid="site-purpose">
        Not an emergency? A <Term id="gp" /> or <Term id="polyclinic">polyclinic</Term> is often the right place to start.
        Getting care in the most suitable place is called <Term id="right_siting">right-siting</Term>.
      </p>
      <p role="note" className="mt-4 inline-flex max-w-prose items-center gap-2 rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-sm font-medium text-bad"
         data-testid="emergency-note">
        <span aria-hidden="true">✚</span>
        In an emergency, call 995 or go to the nearest emergency department.
      </p>
      <p className="mt-2 max-w-prose text-sm text-muted" data-testid="not-advice">
        This site shows public statistics. It isn&apos;t medical advice: if you&apos;re unsure where to go, ask a doctor or nurse.
      </p>
      <form action="/#nearby" method="get" role="search" className="mt-5 max-w-xl" data-testid="near-form">
        <label htmlFor="near" className="block text-sm font-semibold text-ink">Your postcode or area</label>
        <div className="mt-1 flex gap-2">
          <input id="near" name="near" type="text" defaultValue={near} placeholder="e.g. 460123 or Bedok" autoComplete="postal-code"
                 enterKeyHint="search" maxLength={60}
                 className="min-h-12 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-base text-ink placeholder:text-muted" />
          <button type="submit" className="min-h-12 shrink-0 rounded-lg bg-accent px-4 font-semibold text-surface hover:bg-accent-strong">
            Find clinics
          </button>
        </div>
        <p className="mt-1 text-xs text-muted" data-testid="search-privacy">
          Your search is only used to find clinics on this page. It isn&apos;t sent to any other service or saved.
        </p>
      </form>
    </section>
  );
}
