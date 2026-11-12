"use client";

import { type ReactNode, useMemo, useState } from "react";

import { ClientGlossed as Glossed } from "@/components/terms/ClientGlossed";
import { formatAsOf } from "@/lib/dates";
import { announcement, directionsUrl, nearestPlaces, type Result, TYPE_FILTERS, TYPE_LABEL } from "@/lib/finder";
import { ensurePlaces, search, setType, useFinder } from "@/lib/finderStore";
import { BASIS_NOTE, kmText, locate, NOT_FOUND } from "@/lib/nearby";

/** One place: what it is, how far in a straight line, where, and a link to directions in a map app. */
function PlaceCard({ place, nearest }: { place: Result; nearest: boolean }) {
  const where = [place.address, place.postal_code ? `Singapore ${place.postal_code}` : null].filter(Boolean).join(", ");
  return (
    <li className="rounded-xl border border-line bg-surface p-4 shadow-sm" data-testid="nearby-place" data-type={place.type}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-lg font-semibold leading-snug text-ink">{place.name}</h3>
        {nearest ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-3 py-1 text-base font-semibold text-accent-strong"
                data-testid="nearest-badge">
            <span aria-hidden="true">✓</span> Nearest
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-base font-medium text-ink" data-testid="place-type">{TYPE_LABEL[place.type]}</p>
      {where ? <p className="mt-1 text-base text-ink" data-testid="place-address">{where}</p> : null}
      <p className="mt-2">
        <span className="text-2xl font-semibold tabular-nums text-ink" data-testid="nearby-km">{kmText(place.km)}</span>
        <span className="ml-2 text-sm text-muted">straight-line distance</span>
      </p>
      <a href={directionsUrl(place)} target="_blank" rel="noopener noreferrer"
         className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-accent px-4 text-base font-semibold text-accent-strong no-underline hover:bg-accent-soft"
         data-testid="directions">
        <span className="sr-only">{`Directions to ${place.name}, opens in a new tab`}</span>
        <span aria-hidden="true">Directions ↗</span>
      </a>
    </li>
  );
}

/**
 * The public clinic finder. A postcode or area is matched in the browser against the site's own
 * lists (lib/finderStore.ts); the search is kept in the address bar's fragment and nothing typed is
 * sent anywhere. Results are the nearest GP clinics and polyclinics by straight-line distance, and a
 * polite live region says what changed. `provenance` and `clinicAsOf` come from the server.
 */
export function Finder({ clinicAsOf, provenance }: { clinicAsOf: string | null; provenance: ReactNode }) {
  const f = useFinder();
  // What is being typed, until it is searched; otherwise the box follows the address (back and forward).
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? f.query;

  const located = useMemo(() => (f.places && f.query.trim() ? locate(f.query, f.places) : null), [f.places, f.query]);
  const results = useMemo(() => (located?.ok && f.places ? nearestPlaces(located, f.places, f.type) : []), [located, f.places, f.type]);
  const searched = f.query.trim() !== "";
  const failed = searched && f.load === "error";
  const waiting = searched && !located && !failed;

  const announce = failed ? "The clinic lists can't be loaded. Please try again."
    : waiting ? "Finding places…"
    : located && !located.ok ? NOT_FOUND[located.reason]
    : located?.ok ? announcement(located.label, results, f.type) : "";

  return (
    <section aria-label="Find a clinic" className="pb-6 pt-3" data-testid="clinic-finder">
      <form role="search" className="max-w-xl" data-testid="near-form" noValidate
            onSubmit={(e) => { e.preventDefault(); search(text); setDraft(null); }}>
        <label htmlFor="near" className="block text-base font-semibold text-ink">Your postcode or area</label>
        <div className="mt-1 flex gap-2">
          <input id="near" type="text" value={text} onChange={(e) => setDraft(e.target.value)} onFocus={ensurePlaces}
                 placeholder="e.g. 460123 or Bedok" autoComplete="postal-code" enterKeyHint="search" maxLength={60}
                 className="min-h-12 w-full min-w-0 rounded-lg border border-ink/60 bg-surface px-3 text-base text-ink placeholder:text-muted" />
          <button type="submit" className="min-h-12 shrink-0 rounded-lg bg-accent px-5 text-base font-semibold text-surface hover:bg-accent-strong">
            Find clinics
          </button>
        </div>
        <fieldset className="mt-3">
          <legend className="text-base font-semibold text-ink">Show</legend>
          <div role="radiogroup" aria-label="Kind of place" className="mt-1 inline-flex flex-wrap gap-2" data-testid="type-filter">
            {TYPE_FILTERS.map((t) => (
              <label key={t.id}
                     className={"flex min-h-11 cursor-pointer items-center rounded-lg border border-line bg-surface px-4 text-base font-medium text-ink "
                       + "has-checked:border-accent has-checked:bg-accent-soft has-checked:text-accent-strong "
                       + "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"}>
                <input type="radio" name="type" value={t.id} checked={f.type === t.id} onChange={() => setType(t.id)} className="sr-only" />
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="mt-2 text-sm text-muted" data-testid="search-privacy">
          What you type stays in this browser. It isn&apos;t sent to any server or saved.
        </p>
        {/* React doesn't render a noscript's children, so the markup is given as a string. */}
        <noscript dangerouslySetInnerHTML={{ __html: '<p class="mt-2 text-base text-warn" data-testid="needs-js">The clinic finder needs JavaScript. Without it, use the CHAS clinic list on data.gov.sg.</p>' }} />
      </form>

      {/* Always in the page, so a change in its text is announced. */}
      <p role="status" aria-live="polite" className="sr-only" data-testid="live-region">{announce}</p>

      {failed ? (
        <p className="mt-4 max-w-prose rounded-lg border border-warn/40 bg-warn-soft p-3 text-base text-warn" data-testid="nearby-message">
          The clinic lists can&apos;t be loaded right now. Please try again in a few minutes.
        </p>
      ) : waiting ? (
        <p className="mt-4 text-base text-muted" data-testid="nearby-loading">Finding places near {f.query.trim()}…</p>
      ) : located && !located.ok ? (
        <p className="mt-4 max-w-prose rounded-lg border border-warn/40 bg-warn-soft p-3 text-base text-warn" data-testid="nearby-message">
          {NOT_FOUND[located.reason]}
        </p>
      ) : located?.ok ? (
        <div id="nearby" className="mt-6 scroll-mt-4" data-testid="nearby">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Near {located.label}</h2>
          <p className="mt-1 max-w-prose text-base text-ink" data-testid="nearby-basis">
            {BASIS_NOTE[located.basis]} Call ahead to check opening hours
            {clinicAsOf ? (
              <>: the <Glossed text="GP" /> clinic list was last updated on {formatAsOf(clinicAsOf)}. It is the newest list
                data.gov.sg publishes, so a clinic that opened or closed since then may be missing or still shown.
                Only clinics on <Glossed text="CHAS" /> are listed.</>
            ) : "."}
          </p>
          {results.length ? (
            <ol className="mt-4 grid gap-3 md:grid-cols-2" data-testid="results">
              {results.map((r, i) => <PlaceCard key={r.key} place={r} nearest={i === 0} />)}
            </ol>
          ) : (
            <p className="mt-4 text-base text-ink" data-testid="nearby-message">No places of this kind are listed. Try &quot;All&quot;.</p>
          )}
          <div className="mt-2">{provenance}</div>
        </div>
      ) : null}
    </section>
  );
}
