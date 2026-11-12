"use client";

import { usePathname, useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";

import { parseView, type View, viewHref, VIEWS } from "@/lib/homeViews";

/**
 * Who the home page is laid out for: Public, Planner summary or Analyst detail (lib/homeViews.ts).
 * The choice is the URL's ?view=, so it can be shared and back and forward work.
 *
 * - From 640 px: a radio group of three segments. They are real radio buttons, so Tab reaches the
 *   group once and the arrow keys move the choice, as the platform does it.
 * - Narrower: a select, which fits beside the site's name on a phone.
 * - Without JavaScript each is a plain GET form with a button, like the postcode search.
 *
 * Only the home page has views, so only its header has the control (app/@viewbar). The server
 * passes the view it read from the URL, so the first HTML already shows the right choice.
 * A header slot keeps its last page when a link is followed, so the control checks the path itself
 * and renders nothing anywhere else (`home` is for /dev/components, which shows it off the home page).
 */
export function ViewSwitch({ view: current, home = "/" }: { view: View; home?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  // Show the new choice at once; the page follows when the server has rendered it.
  const [view, setView] = useOptimistic(current);
  const [, startTransition] = useTransition();

  const go = (next: View) => {
    if (next === view) return;
    startTransition(() => {
      setView(next);
      router.push(viewHref(next, window.location.search), { scroll: false });
    });
  };
  if (pathname !== home) return null;

  const submit = (
    <noscript>
      <button type="submit" className="ml-2 min-h-11 rounded-md border border-line bg-surface px-3 text-sm font-medium text-ink">
        Change view
      </button>
    </noscript>
  );

  return (
    <div data-testid="view-switch" data-view={view}>
      <form action="/" method="get" className="hidden items-center sm:flex">
        <div role="radiogroup" aria-label="View" className="inline-flex rounded-md border border-line bg-surface p-1"
             data-testid="view-radios">
          {VIEWS.map((v) => (
            <label key={v.id}
                   className={"flex min-h-11 cursor-pointer items-center rounded border border-transparent px-3 text-sm font-medium "
                     + "text-muted hover:text-ink has-checked:border-accent has-checked:bg-accent-soft has-checked:text-accent-strong "
                     + "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"}>
              <input type="radio" name="view" value={v.id} checked={view === v.id} onChange={() => go(v.id)} className="sr-only" />
              {v.label}
            </label>
          ))}
        </div>
        {submit}
      </form>

      <form action="/" method="get" className="flex items-center sm:hidden">
        <label htmlFor="view-select" className="mr-2 text-sm font-medium text-muted">View</label>
        <select id="view-select" name="view" value={view} onChange={(e) => go(parseView(e.target.value))}
                className="min-h-11 rounded-md border border-line bg-surface px-2 text-base font-medium text-ink"
                data-testid="view-select">
          {VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        {submit}
      </form>
    </div>
  );
}
