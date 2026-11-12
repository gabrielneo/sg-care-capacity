"use client";

import { CaveatChip } from "@/components/CaveatChip";
import type { CareRow } from "@/lib/careMapState";
import { formatDelta, type Sort } from "@/lib/planner";

import { StatusBadge } from "./StatusBadge";

const hrs = (v: number) => `${v.toFixed(1)} h`;

/** What each sortable column does, and the direction it reads in (the Planner cards' orders: lib/planner.ts). */
const COLUMNS: { sort: Sort; label: string; dir: "ascending" | "descending" }[] = [
  { sort: "name", label: "Hospital", dir: "ascending" },
  { sort: "usual", label: "Status against usual", dir: "descending" },
  { sort: "hours", label: "Wait for a ward bed, last week", dir: "descending" },
];

/**
 * The hospitals as a table: the keyboard and screen-reader equivalent of the map, with the same
 * hospitals and the same badge. Each header is a button that sorts; the order is in the address.
 * A row's hospital name opens the same details as its marker. The first column's cell holds the
 * cluster and any coverage caveat, so at 375px there is no sideways scrolling.
 */
export function CareList({ rows, sort, onSort, onOpen }: {
  rows: CareRow[]; sort: Sort; onSort: (sort: Sort) => void; onOpen: (code: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface" data-testid="care-list">
      <table className="w-full text-left text-sm">
        <caption className="p-3 text-left text-sm text-muted">
          Hospital emergency departments: last week&apos;s wait for a ward bed after the decision to admit, against each hospital&apos;s own usual.
          Sorted by {COLUMNS.find((c) => c.sort === sort)?.label.toLowerCase()}.
        </caption>
        <thead className="border-y border-line bg-page text-xs text-muted">
          <tr>
            {COLUMNS.map((c) => (
              <th key={c.sort} scope="col" aria-sort={sort === c.sort ? c.dir : "none"} className="p-0 font-semibold">
                <button type="button" onClick={() => onSort(c.sort)} className="min-h-11 w-full px-3 text-left font-semibold" data-sort={c.sort}>
                  {c.label}{sort === c.sort ? <span aria-hidden="true">{c.dir === "ascending" ? " ↑" : " ↓"}</span> : null}
                </button>
              </th>
            ))}
            <th scope="col" className="px-3 font-semibold max-sm:hidden">Against usual</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const delta = formatDelta(r.pct);
            return (
              <tr key={r.code} className="border-b border-line last:border-0 align-top" data-testid="care-row" data-hospital={r.code} data-level={r.level}>
                <th scope="row" className="p-3 text-left font-medium">
                  <button type="button" onClick={() => onOpen(r.code)} data-hospital-trigger={r.code}
                          className="min-h-11 text-left font-semibold text-accent underline underline-offset-3">
                    {r.name}<span className="sr-only">: show details</span>
                  </button>
                  <span className="block text-xs font-normal text-muted" data-testid="row-cluster">{r.cluster}</span>
                  {r.note ? <span className="mt-1 block"><CaveatChip><span data-testid="row-note">{r.note}</span></CaveatChip></span> : null}
                </th>
                <td className="p-3"><StatusBadge level={r.level} /></td>
                <td className="p-3 tabular-nums">
                  <span data-testid="row-hours">{r.latest == null ? "–" : hrs(r.latest)}</span>
                  {/* Below 640px the change sits under the hours: a fourth column would not fit. */}
                  {delta && r.usual != null ? (
                    <span className="block text-xs text-muted sm:hidden">
                      <span aria-hidden="true">{delta.text}</span><span className="sr-only">{delta.spoken}</span> vs usual {hrs(r.usual)}
                    </span>
                  ) : null}
                </td>
                <td className="p-3 tabular-nums max-sm:hidden" data-testid="row-delta">
                  {delta && r.usual != null ? (
                    <><span aria-hidden="true">{delta.text}</span><span className="sr-only">{delta.spoken}</span>
                      <span className="block text-xs text-muted">usual {hrs(r.usual)}</span></>
                  ) : <span className="text-muted">No comparison</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
