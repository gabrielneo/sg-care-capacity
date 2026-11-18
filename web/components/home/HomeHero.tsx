import { Term } from "@/components/terms/Term";

/**
 * The top of the clinic finder (/find): the page's heading, what the site is for and "not medical advice". It has no red 995
 * banner (removed at the owner's request, 16 Nov 2026); the emergency number stays in the footer of every page and in the menu sheet.
 */
export function HomeNotice() {
  return (
    <section aria-labelledby="home-title" data-testid="home-hero" data-density="full">
      <h1 id="home-title" className="mt-2 max-w-3xl font-semibold tracking-tight text-ink sm:mt-4 text-h1">
        Find a clinic near you
      </h1>
      <p className="mt-2 max-w-prose text-body text-ink sm:mt-3" data-testid="site-purpose">
        Not an emergency? A <Term id="gp" /> or <Term id="polyclinic">polyclinic</Term> is often the right place to start.
        Getting care in the most suitable place is called <Term id="right_siting">right-siting</Term>.
      </p>
      <p className="mt-2 max-w-prose text-small text-ink sm:mt-3 sm:text-body" data-testid="not-advice">
        This site shows public statistics. It isn&apos;t medical advice: if you&apos;re unsure where to go, ask a doctor or nurse.
      </p>
    </section>
  );
}
