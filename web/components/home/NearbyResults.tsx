import type { ReactNode } from "react";

import { Provenance } from "@/components/Provenance";
import { Glossed } from "@/components/terms/Glossed";
import { Term } from "@/components/terms/Term";
import type { Meta } from "@/lib/api/types";
import { formatAsOf } from "@/lib/dates";
import { BASIS_NOTE, kmText, type Located, type Nearby, NOT_FOUND, type Place } from "@/lib/nearby";

export interface NearbyLists {
  polyclinics: Nearby<Place>[];
  gps: Nearby<Place & { has_cdmp: boolean | null }>[];
  hospitals: Nearby<Place & { code: string }>[];
}

function Column({ title, testId, children }: { title: ReactNode; testId: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm" data-testid={testId}>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <ol className="mt-2 divide-y divide-line">{children}</ol>
    </div>
  );
}

function Row({ name, place, d, extra }: { name: ReactNode; place: Place; d: number; extra?: ReactNode }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2" data-testid="nearby-place">
      <div className="min-w-0">
        <p className="font-medium text-ink">{name}</p>
        <p className="text-xs text-muted">
          {[place.address, place.postal_code ? `Singapore ${place.postal_code}` : null].filter(Boolean).join(", ")}
          {extra}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink" data-testid="nearby-km">{kmText(d)}</span>
    </li>
  );
}

/** What the postcode search found: the nearest polyclinics, CHAS GP clinics and hospital EDs. */
export function NearbyResults({ located, lists, clinicMeta, polyclinicMeta }: {
  located: Located; lists: NearbyLists | null; clinicMeta: Meta | null; polyclinicMeta: Meta | null }) {
  if (!located.ok || !lists) {
    const reason = located.ok ? null : located.reason;
    return (
      <section id="nearby" aria-labelledby="nearby-heading" className="scroll-mt-4 pb-6" data-testid="nearby">
        <h2 id="nearby-heading" className="sr-only">Clinics near you</h2>
        <p role="status" className="max-w-prose rounded-lg border border-warn/40 bg-warn-soft p-3 text-sm text-warn" data-testid="nearby-message">
          {reason ? NOT_FOUND[reason] : "The clinic lists can't be loaded right now. Please try again in a few minutes."}
        </p>
      </section>
    );
  }
  return (
    <section id="nearby" aria-labelledby="nearby-heading" className="scroll-mt-4 pb-6" data-testid="nearby">
      <h2 id="nearby-heading" className="text-xl font-semibold tracking-tight text-ink">Near {located.label}</h2>
      <p className="mt-1 text-sm text-muted" data-testid="nearby-basis">
        {BASIS_NOTE[located.basis]} Call ahead to check opening hours
        {clinicMeta ? <>: the <Term id="gp" /> clinic list was last updated on {formatAsOf(clinicMeta.as_of)}.</> : "."}
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {lists.polyclinics.length ? (
          <Column title={<>Nearest <Term id="polyclinic">polyclinics</Term></>} testId="nearby-polyclinics">
            {lists.polyclinics.map((n) => <Row key={n.place.name} name={n.place.name} place={n.place} d={n.km} />)}
          </Column>
        ) : null}
        <Column title={<>Nearest <Term id="chas" /> <Term id="gp" /> clinics</>} testId="nearby-gps">
          {lists.gps.map((n) => (
            <Row key={`${n.place.name}|${n.place.postal_code}`} name={n.place.name} place={n.place} d={n.km}
                 extra={n.place.has_cdmp ? <span className="block"><Glossed text="Takes part in CDMP" /></span> : null} />
          ))}
        </Column>
        <Column title={<>Nearest hospital <Term id="ed" plural /> <span className="font-normal text-muted">(for emergencies)</span></>}
                testId="nearby-hospitals">
          {lists.hospitals.map((n) => <Row key={n.place.code} name={n.place.name} place={n.place} d={n.km} />)}
        </Column>
      </div>
      <div className="mt-2 grid gap-x-6 md:grid-cols-2">
        {polyclinicMeta ? <Provenance meta={polyclinicMeta} compact /> : null}
        {clinicMeta ? <Provenance meta={clinicMeta} compact /> : null}
      </div>
    </section>
  );
}
