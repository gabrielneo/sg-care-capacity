import Link from "next/link";

import type { Hospital } from "@/lib/api/types";
import { shortNote } from "@/lib/hospitalNotes";

/** A plain GET form: works with the keyboard, without JavaScript, and gives shareable URLs. */
export function EdFilterForm({ hospitals, selected, from, to }: { hospitals: Hospital[]; selected: string[]; from: string; to: string }) {
  const all = selected.length === 0;
  return (
    <form method="get" action="/ed-trends" className="mb-6 rounded-lg border border-line bg-surface p-4">
      <fieldset>
        <legend className="text-sm font-semibold text-ink">Hospitals</legend>
        <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {hospitals.map((h) => {
            const note = shortNote(h);
            return (
              <label key={h.hospital_code} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name="hospital" value={h.hospital_code} defaultChecked={all || selected.includes(h.hospital_code)}
                       className="h-4 w-4 accent-accent" />
                <span>
                  <span className="font-medium">{h.hospital_code}</span> {h.hospital_name.replace(/\s*\(UCC\)$/, "")}
                  {note ? <span className="text-muted"> · {note.toLowerCase()}</span> : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="text-sm">
          <span className="block font-semibold">From</span>
          <input type="date" name="from" defaultValue={from} className="mt-1 min-h-11 rounded-md border border-line px-2" />
        </label>
        <label className="text-sm">
          <span className="block font-semibold">To</span>
          <input type="date" name="to" defaultValue={to} className="mt-1 min-h-11 rounded-md border border-line px-2" />
        </label>
        <button type="submit" className="min-h-11 rounded-md bg-accent px-4 text-sm font-medium text-surface">Show</button>
        <Link href="/ed-trends" className="flex min-h-11 items-center text-sm">Reset</Link>
        <p className="w-full text-xs text-muted">Up to 2 years at a time. Default: the 90 days up to the latest day MOH has published.</p>
      </div>
    </form>
  );
}
