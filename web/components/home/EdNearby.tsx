"use client";

import Link from "next/link";
import { type ReactNode, useMemo } from "react";

import { Prose } from "@/components/Prose";
import { SectionHeading } from "@/components/SectionHeading";
import { ClientTerm } from "@/components/terms/ClientTerm";
import { useFinder } from "@/lib/finderStore";
import { kmText, locate, NEAREST, nearest } from "@/lib/nearby";

/**
 * "How long were bed waits at EDs near you?": the three nearest hospitals to the search, as plain
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
      <SectionHeading id="ed-heading" lede={eds.length
        ? "The three nearest hospital emergency departments, against each hospital's own usual week. This is context, not advice on where to go."
        : located?.ok
          ? "This data release has no hospital locations, so the nearest emergency departments can't be shown."
          : "Search for a postcode or area above to see the three nearest hospital emergency departments."} ledeTestId={eds.length ? undefined : "ed-prompt"}>
        How long were bed waits at <ClientTerm id="ed" plural /> near you in the latest complete week?
      </SectionHeading>
      {eds.length ? (
        <>
          <ol className="card-grid md:grid-cols-3" data-testid="ed-list">
            {eds.map((n) => (
              <li key={n.place.code} className="flex flex-col gap-2" data-testid="ed-item">
                <p className="text-body font-semibold text-ink" data-testid="ed-km">
                  {kmText(n.km)} <span className="font-normal text-muted">straight-line distance</span>
                </p>
                <div className="flex-1">{cards[n.place.code]}</div>
              </li>
            ))}
          </ol>
          <Prose as="div" size="small" tone="muted" className="mt-3 space-y-1">{notes}</Prose>
          {provenance}
        </>
      ) : null}
      <p className="mt-4 text-body">
        <Link href={analystHref} className="inline-flex min-h-11 items-center">See every hospital and the statistics: Analyst view</Link>
      </p>
    </section>
  );
}
