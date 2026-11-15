"use client";

import { CaveatChip } from "@/components/CaveatChip";
import { HospitalName } from "@/components/HospitalName";
import type { CareRow } from "@/lib/careMapState";
import { URGENT_CARE_HEADING, URGENT_CARE_NOTE } from "@/lib/hospitals";
import { formatDelta, type Sort } from "@/lib/planner";

import { StatusBadge } from "./StatusBadge";
import { Missing } from "@/components/Missing";

const hrs = (v: number) => `${v.toFixed(1)} h`;

/** Emergency departments a phone lists before "Show all". */
export const PHONE_ROWS = 4;

/** What each sortable column does, and the direction it reads in (the Planner cards' orders: lib/planner.ts). */
const COLUMNS: { sort: Sort; label: string; dir: "ascending" | "descending" }[] = [
  { sort: "name", label: "Hospital", dir: "ascending" },
  { sort: "usual", label: "Status against usual", dir: "descending" },
  { sort: "hours", label: "Bed wait, latest complete week", dir: "descending" },
];

/**
 * The hospitals as a table: the keyboard and screen-reader equivalent of the map, with the same
 * hospitals and the same badge. Each header is a button that sorts; the order is in the address.
 * A row's hospital name opens the same details as its marker. The first column's cell holds the
 * cluster and any coverage caveat, so at 375px there is no sideways scrolling.
 *
 * Below 640px each row is two lines (review N2): the name on its own line, then the status and the hours side by side,
 * instead of three narrow columns that wrap a name onto three lines. The header becomes a row of sort buttons. The
 * explicit table roles keep it a table for screen readers when CSS changes the display of its parts.
 */
export function CareList({ rows, sort, onSort, onOpen }: {
  rows: CareRow[]; sort: Sort; onSort: (sort: Sort) => void; onOpen: (code: string) => void }) {
  // The EDs in the chosen order, then the urgent care centre in its own row group (lib/hospitals.ts, ADR 0012).
  const eds = rows.filter((r) => !r.urgentCare);
  const ucc = rows.filter((r) => r.urgentCare);
  // Below 768px the first PHONE_ROWS emergency departments show and the rest are one tap away (review N12); the order is the chosen
  // sort, so the most notable come first. The urgent care centre keeps its own group, always shown.
  const folded = eds.length >= PHONE_ROWS + 2;
  const renderRow = (r: CareRow, index = 0) => {
    const delta = formatDelta(r.pct);
    return (
      <tr key={r.code} role="row" className={`border-b border-line last:border-0 align-top max-sm:grid max-sm:grid-cols-2 ${folded && !r.urgentCare && index >= PHONE_ROWS ? "phone-fold-hide" : ""}`} data-testid="care-row" data-hospital={r.code} data-level={r.level}>
        <th scope="row" role="rowheader" className="p-3 text-left font-semibold max-sm:col-span-2 max-sm:pb-1">
          <button type="button" onClick={() => onOpen(r.code)} data-hospital-trigger={r.code}
                  className="min-h-11 text-left font-semibold text-accent underline underline-offset-3">
            <HospitalName hospital={{ hospital_code: r.code, hospital_name: r.name, short_name: r.shortName }} inControl />
        <span className="sr-only">: show details</span>
          </button>
          <span className="block text-meta font-normal text-muted" data-testid="row-cluster">{r.cluster}</span>
          {r.note ? <span className="mt-1 block"><CaveatChip><span data-testid="row-note">{r.note}</span></CaveatChip></span> : null}
        </th>
        <td role="cell" className="p-3 max-sm:pt-1"><StatusBadge level={r.level} /></td>
        <td role="cell" className="p-3 tabular-nums max-sm:pt-1">
          <span data-testid="row-hours">{r.latest == null ? <Missing /> : hrs(r.latest)}</span>
          {/* Below 640px the change sits under the hours: a fourth column would not fit. */}
          {delta && r.usual != null ? (
            <span className="block text-meta text-muted sm:hidden">
              <span aria-hidden="true">{delta.text}</span><span className="sr-only">{delta.spoken}</span> vs usual {hrs(r.usual)}
            </span>
          ) : null}
        </td>
        <td role="cell" className="p-3 tabular-nums max-sm:hidden" data-testid="row-delta">
          {delta && r.usual != null ? (
            <><span aria-hidden="true">{delta.text}</span><span className="sr-only">{delta.spoken}</span>
              <span className="block text-meta text-muted">usual {hrs(r.usual)}</span></>
          ) : <span className="text-muted">No comparison</span>}
        </td>
      </tr>
    );
  };
  return (
    <div className="phone-fold">
    <div className="overflow-x-auto rounded-xl border border-line bg-surface" data-testid="care-list">
      <table role="table" className="w-full text-left text-small max-sm:block">
        <caption className="p-3 text-left text-small text-muted max-sm:block">
          Hospital emergency departments: the wait for a ward bed after the decision to admit in the latest complete week, against each hospital&apos;s own usual.
          Sorted by {COLUMNS.find((c) => c.sort === sort)?.label.toLowerCase()}.
        </caption>
        <thead role="rowgroup" className="border-y border-line bg-page text-meta text-muted max-sm:block">
          <tr role="row" className="max-sm:flex max-sm:flex-wrap">
            {COLUMNS.map((c) => (
              <th key={c.sort} scope="col" role="columnheader" aria-sort={sort === c.sort ? c.dir : "none"} className="p-0 font-semibold">
                <button type="button" onClick={() => onSort(c.sort)} className="min-h-11 w-full px-3 text-left font-semibold" data-sort={c.sort}>
                  {c.label}{sort === c.sort ? <span aria-hidden="true">{c.dir === "ascending" ? " ↑" : " ↓"}</span> : null}
                </button>
              </th>
            ))}
            <th scope="col" role="columnheader" className="px-3 font-semibold max-sm:hidden">Against usual</th>
          </tr>
        </thead>
        <tbody role="rowgroup" data-group="ed" className="max-sm:block">
          {eds.map((r, i) => renderRow(r, i))}
        </tbody>
        {ucc.length ? (
          <tbody role="rowgroup" data-group="ucc" data-testid="care-ucc" className="max-sm:block">
            <tr role="row" className="border-b border-line bg-page max-sm:block">
              <th scope="rowgroup" colSpan={4} className="block px-3 py-2 text-left text-meta font-semibold text-ink sm:table-cell">
                {URGENT_CARE_HEADING} <span className="font-normal text-muted">· {URGENT_CARE_NOTE}</span>
              </th>
            </tr>
            {ucc.map((r) => renderRow(r))}
          </tbody>
        ) : null}
      </table>
    </div>
    {folded ? (
      <details className="phone-fold-toggle mt-2" data-testid="more-rows">
        <summary className="min-h-11 cursor-pointer select-none py-3 text-small font-semibold text-accent">
          <span className="when-closed">Show all {eds.length} emergency departments</span><span className="when-open">Show the first {PHONE_ROWS} only</span>
        </summary>
      </details>
    ) : null}
    </div>
  );
}
