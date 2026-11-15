import { FreshnessBadge } from "@/components/FreshnessBadge";
import type { Source } from "@/lib/api/types";
import { formatAsOf } from "@/lib/dates";
import { BASIS } from "@/lib/copy";
import { cadenceOf, datasetFreshness, ruleText } from "@/lib/freshness";

import { Glossed } from "../terms/Glossed";

export function FreshnessTable({ sources }: { sources: Source[] }) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Freshness by source (scrolls sideways)">
      <table className="w-full min-w-[720px] border-collapse text-small" data-testid="freshness-table">
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
            const cadence = cadenceOf(s.id);
            return (
              <tr key={s.id} className="border-b border-line align-top">
                <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                  {s.url ? <a href={s.url}><Glossed text={s.name} plain /></a> : <Glossed text={s.name} />}
                </th>
                <td className="py-1.5 pr-3 tabular-nums">{s.as_of ? <Glossed text={formatAsOf(s.as_of, { withTime: cadence === "moment" })} /> : "Unknown"}</td>
                <td className="py-1.5 pr-3 text-muted">{BASIS[s.id] ?? ""}</td>
                <td className="py-1.5 pr-3 tabular-nums text-muted">{s.last_fetched_at ? formatAsOf(s.last_fetched_at) : "Unknown"}</td>
                <td className="py-1.5">
                  {/* One function and one config for every dataset (docs/datasets.yml). */}
                  {s.as_of ? <FreshnessBadge freshness={datasetFreshness(s.id, s.as_of)} /> : null}
                  <span className="mt-0.5 block text-meta text-muted">{ruleText(s.id)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
