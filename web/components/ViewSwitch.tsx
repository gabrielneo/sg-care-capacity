"use client";

import { usePathname, useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";

import { type View, viewHref, VIEWS } from "@/lib/homeViews";

/**
 * Who the home page is laid out for: Public, Planner or Analyst (lib/homeViews.ts).
 * The choice is the URL's ?view=, so it can be shared and back and forward work.
 *
 * Both layouts are real radio buttons, so Tab reaches the group once and the arrow keys move the choice, as the platform does it:
 * - "bar": a 36px segmented control in the header, from 768px (hidden below it).
 * - "sheet": a column of 44px rows, inside the phone's menu sheet.
 * `onChoose` lets the sheet close itself once a view is picked (the address changes, but the path doesn't, so a route change can't do it).
 * Without JavaScript each is a plain GET form with a button, like the postcode search.
 *
 * Only the home page has views, so only its header has the control (app/@viewbar). The server
 * passes the view it read from the URL, so the first HTML already shows the right choice.
 * A header slot keeps its last page when a link is followed, so the control checks the path itself
 * and renders nothing anywhere else (`home` is for /dev/components, which shows it off the home page).
 */
export function ViewSwitch({ view: current, home = "/", placement = "bar", onChoose }: { view: View; home?: string; placement?: "bar" | "sheet"; onChoose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  // Show the new choice at once; the page follows when the server has rendered it.
  const [view, setView] = useOptimistic(current);
  const [, startTransition] = useTransition();

  const go = (next: View) => {
    onChoose?.();
    if (next === view) return;
    startTransition(() => {
      setView(next);
      router.push(viewHref(next, window.location.search), { scroll: false });
    });
  };
  if (pathname !== home) return null;

  const bar = placement === "bar";
  return (
    <div data-testid={bar ? "view-switch" : "view-switch-sheet"} data-view={view} className={bar ? "hidden md:block" : ""}>
      <form action="/" method="get" className="flex items-center">
        <div role="radiogroup" aria-label="View" data-testid={bar ? "view-radios" : "view-radios-sheet"}
             className={bar ? "inline-flex control-h overflow-hidden rounded-md border border-control bg-surface" : "flex w-full flex-col rounded-md border border-control bg-surface"}>
          {VIEWS.map((v) => (
            <label key={v.id}
                   className={`flex cursor-pointer items-center border-line px-3 text-small font-semibold text-muted hover:text-ink has-checked:bg-accent-soft has-checked:text-accent `
                     + `has-focus-visible:outline-3 has-focus-visible:-outline-offset-3 has-focus-visible:outline-accent `
                     + (bar ? "h-full border-l first:border-l-0" : "min-h-11 border-t first:border-t-0 text-body")}>
              <input type="radio" name="view" value={v.id} checked={view === v.id} onChange={() => go(v.id)} className="sr-only" />
              <span aria-hidden="true" className="mr-2 w-3 text-center">{view === v.id ? "✓" : ""}</span>
              {v.label}
            </label>
          ))}
        </div>
        <noscript>
          <button type="submit" className="ml-2 min-h-11 rounded-md border border-control bg-surface px-3 text-small font-semibold text-ink">Change view</button>
        </noscript>
      </form>
    </div>
  );
}
