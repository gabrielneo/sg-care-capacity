import Link from "next/link";

import type { Hospital } from "@/lib/api/types";
import { formatAsOf } from "@/lib/dates";
import { shortNote } from "@/lib/hospitalNotes";

import { Glossed } from "./terms/Glossed";
import { Term } from "./terms/Term";

/**
 * A plain GET form: works with the keyboard, without JavaScript, and gives shareable URLs.
 * Below 768px it folds behind one line that says what is shown (review N12: 9 hospitals' checkboxes took 688px above the charts);
 * the phone-fold is CSS only (globals.css), so the page never shifts when it loads.
 */
export function EdFilterForm({ hospitals, selected, from, to }: { hospitals: Hospital[]; selected: string[]; from: string; to: string }) {
  const all = selected.length === 0;
  const count = all ? hospitals.length : selected.length;
  return (
    <div className="phone-fold mb-6" data-testid="ed-filters">
    <details className="phone-fold-toggle rounded-lg border border-line bg-surface" data-testid="ed-filters-toggle">
      <summary className="flex min-h-11 cursor-pointer select-none flex-col justify-center px-4 py-2">
        <span className="text-small font-semibold text-accent">
          <span className="when-closed">Change hospitals or dates</span><span className="when-open">Hide hospitals and dates</span>
        </span>
        <span className="text-meta text-muted" data-testid="ed-filters-current">
          {all ? `All ${count} hospitals` : `${count} of ${hospitals.length} hospitals`}, {formatAsOf(from)} to {formatAsOf(to)}
        </span>
      </summary>
    </details>
    <form method="get" action="/ed-trends" className="phone-fold-hide rounded-lg border border-line bg-surface card max-md:mt-2">
      <fieldset>
        <legend className="text-small font-semibold text-ink">Hospitals</legend>
        <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {hospitals.map((h) => {
            const note = shortNote(h);
            return (
              <label key={h.hospital_code} className="flex min-h-11 items-center gap-2 text-small">
                <input type="checkbox" name="hospital" value={h.hospital_code} defaultChecked={all || selected.includes(h.hospital_code)}
                       className="h-4 w-4 accent-accent" />
                <span>
                  <Term id={h.hospital_code.toLowerCase()} plain />
                  {note ? <span className="text-muted"> · {note.toLowerCase()}</span> : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="text-small">
          <span className="block font-semibold">From</span>
          <input type="date" name="from" defaultValue={from} className="mt-1 min-h-11 rounded-md border border-control px-2" />
        </label>
        <label className="text-small">
          <span className="block font-semibold">To</span>
          <input type="date" name="to" defaultValue={to} className="mt-1 min-h-11 rounded-md border border-control px-2" />
        </label>
        <button type="submit" className="min-h-11 rounded-md bg-primary px-4 text-small font-semibold text-on-primary">Show</button>
        <Link href="/ed-trends" className="flex min-h-11 min-w-11 items-center justify-center text-small">Reset</Link>
        <p className="w-full text-meta text-muted"><Glossed text="Up to 2 years at a time. Default: the 90 days up to the latest day MOH has published." /></p>
      </div>
    </form>
    </div>
  );
}
