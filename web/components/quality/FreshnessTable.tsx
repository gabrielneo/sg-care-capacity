import { FreshnessBadge } from "@/components/FreshnessBadge";
import type { Source } from "@/lib/api/types";
import { formatAsOf } from "@/lib/dates";
import { CADENCE_BY_SOURCE, THRESHOLDS } from "@/lib/freshness";

export function FreshnessTable({ sources }: { sources: Source[] }) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Freshness by source (scrolls sideways)">
      <table className="w-full min-w-[720px] border-collapse text-sm" data-testid="freshness-table">
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="py-1.5 pr-3 font-semibold">Source</th>
            <th scope="col" className="py-1.5 pr-3 font-semibold">Data as of</th>
            <th scope="col" className="py-1.5 pr-3 font-semibold">Basis</th>
            <th scope="col" className="py-1.5 pr-3 font-semibold">Last downloaded</th>
            <th scope="col" className="py-1.5 font-semibold">Freshness</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => {
            const cadence = CADENCE_BY_SOURCE[s.id] ?? "irregular";
            return (
              <tr key={s.id} className="border-b border-line align-top">
                <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                  {s.url ? <a href={s.url}>{s.name}</a> : s.name}
                </th>
                <td className="py-1.5 pr-3 tabular-nums">{s.as_of ? formatAsOf(s.as_of, { withTime: cadence === "live" }) : "Unknown"}</td>
                <td className="py-1.5 pr-3 text-muted">{s.as_of_basis ?? ""}</td>
                <td className="py-1.5 pr-3 tabular-nums text-muted">{s.last_fetched_at ? formatAsOf(s.last_fetched_at) : "Unknown"}</td>
                <td className="py-1.5">
                  {s.as_of ? <FreshnessBadge asOf={s.as_of} cadence={cadence} /> : null}
                  <span className="mt-0.5 block text-xs text-muted">{THRESHOLDS[cadence].describe}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
