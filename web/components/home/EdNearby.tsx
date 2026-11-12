"use client";

import Link from "next/link";
import { type ReactNode, useMemo } from "react";

import { ClientTerm } from "@/components/terms/ClientTerm";
import { useFinder } from "@/lib/finderStore";
import { kmText, locate, NEAREST, nearest } from "@/lib/nearby";

/**
 * "How busy were EDs near you last week?": the three nearest hospitals to the search, as plain
 * cards. The cards are made on the server for every hospital (`cards`, by hospital code); this
 * picks the nearest three in the browser. Before a search it asks for one: the page doesn't rank
 * every hospital for someone who is looking for a clinic.
 */
export function EdNearby({ cards, notes, provenance, analystHref }: {
  cards: Record<string, ReactNode>; notes: ReactNode; provenance: ReactNode; analystHref: string }) {
  const f = useFinder();
  const located = useMemo(() => (f.places && f.query.trim() ? locate(f.query, f.places) : null), [f.places, f.query]);
  const eds = useMemo(
    () => (located?.ok && f.places ? nearest(located, f.places.hospitals, NEAREST.hospitals).filter((n) => cards[n.place.code]) : []),
    [located, f.places, cards],
  );
  return (
    <section aria-labelledby="ed-heading" className="py-8" data-testid="ed-near">
      <h2 id="ed-heading" className="text-2xl font-semibold tracking-tight text-ink">How busy were <ClientTerm id="ed" plural /> near you last week?</h2>
      {eds.length ? (
        <>
          <p className="mt-1 max-w-prose text-base text-ink">
            The three nearest hospital emergency departments, against each hospital&apos;s own usual week. This is context, not advice on where to go.
          </p>
          <ol className="mt-4 grid gap-4 md:grid-cols-3" data-testid="ed-list">
            {eds.map((n) => (
              <li key={n.place.code} className="flex flex-col gap-2" data-testid="ed-item">
                <p className="text-base font-medium text-ink" data-testid="ed-km">
                  {kmText(n.km)} <span className="font-normal text-muted">straight-line distance</span>
                </p>
                <div className="flex-1">{cards[n.place.code]}</div>
              </li>
            ))}
          </ol>
          <div className="mt-3 max-w-prose space-y-1 text-sm text-muted">{notes}</div>
          {provenance}
        </>
      ) : (
        <p className="mt-1 max-w-prose text-base text-ink" data-testid="ed-prompt">
          {located?.ok
            ? "This data release has no hospital locations, so the nearest emergency departments can't be shown."
            : "Search for a postcode or area above to see the three nearest hospital emergency departments."}
        </p>
      )}
      <p className="mt-4 text-base">
        <Link href={analystHref} className="inline-flex min-h-11 items-center">See every hospital and the statistics: Analyst detail</Link>
      </p>
    </section>
  );
}
