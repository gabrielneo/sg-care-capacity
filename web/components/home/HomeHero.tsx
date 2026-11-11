import { Term } from "@/components/terms/Term";
import type { Density } from "@/lib/homeViews";

/**
 * The top of the home page on every view: what the page is, the emergency line and "not medical
 * advice". The full notice (the public view) also says where to go when it isn't an emergency.
 */
export function HomeNotice({ density = "full" }: { density?: Density }) {
  const full = density === "full";
  return (
    <section aria-labelledby="home-title" className={full ? "pb-2 pt-2 sm:pt-6" : "pb-2 pt-2"} data-testid="home-hero" data-density={density}>
      {full ? (
        <h1 id="home-title" className="max-w-3xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Check how busy hospital emergency departments are, and find a clinic near you
        </h1>
      ) : (
        <h1 id="home-title" className="max-w-3xl text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Hospital emergency departments: last week against a usual week
        </h1>
      )}
      {full ? (
        <p className="mt-3 max-w-prose text-lg text-muted" data-testid="site-purpose">
          Not an emergency? A <Term id="gp" /> or <Term id="polyclinic">polyclinic</Term> is often the right place to start.
          Getting care in the most suitable place is called <Term id="right_siting">right-siting</Term>.
        </p>
      ) : null}
      <p role="note" className="mt-4 inline-flex max-w-prose items-center gap-2 rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-sm font-medium text-bad"
         data-testid="emergency-note">
        <span aria-hidden="true">✚</span>
        In an emergency, call 995 or go to the nearest emergency department.
      </p>
      <p className="mt-2 max-w-prose text-sm text-muted" data-testid="not-advice">
        This site shows public statistics. It isn&apos;t medical advice: if you&apos;re unsure where to go, ask a doctor or nurse.
      </p>
    </section>
  );
}

/**
 * The postcode search. A plain GET form (/?near=...), so it works without JavaScript and the
 * result is a shareable link.
 */
export function ClinicFinder({ near }: { near: string }) {
  return (
    <section aria-label="Find a clinic" className="pb-6 pt-3" data-testid="clinic-finder">
      <form action="/#nearby" method="get" role="search" className="max-w-xl" data-testid="near-form">
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
