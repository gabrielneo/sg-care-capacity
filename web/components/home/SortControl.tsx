import Link from "next/link";

import { type Sort, sortHref, SORTS } from "@/lib/planner";

/**
 * "Order by: Change vs usual · Hours · A–Z": a segmented control in the ViewSwitch's style. The order is in the URL
 * (?sort=), so it can be shared and works without JavaScript, like the view. `query` is the page's current query
 * string, which each link keeps. 44px rows on a phone, the switch's 36px from 768px.
 */
export function SortControl({ sort, query }: { sort: Sort; query: string }) {
  return (
    <nav aria-label="Order of the hospitals" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small" data-testid="sort-links">
      <span className="text-muted" aria-hidden="true">Order by</span>
      <ul className="inline-flex overflow-hidden rounded-md border border-control bg-surface md:control-h">
        {SORTS.map((s) => (
          <li key={s.id} className="border-l border-line first:border-l-0">
            <Link href={sortHref(s.id, query)} scroll={false} aria-current={s.id === sort ? "true" : undefined}
                  className={"flex h-full min-h-11 items-center whitespace-nowrap px-3 font-semibold link-quiet md:min-h-0 "
                    + "focus-visible:-outline-offset-3 "
                    + (s.id === sort ? "bg-accent-soft text-accent" : "text-muted hover:text-ink")}>
              <span aria-hidden="true" className="mr-2 w-3 text-center">{s.id === sort ? "✓" : ""}</span>
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
