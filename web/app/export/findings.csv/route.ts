/**
 * Every published finding, in rank order, with its key number, test and caveats. data_as_of and source
 * are the finding's own sources' (the oldest date among them); finding_as_of is the end of its data window.
 */
import { api, settle } from "@/lib/api/client";
import { exportError, tableResponse } from "@/lib/exportRoutes";
import { findingMeta } from "@/lib/provenance";

export async function GET(request: Request) {
  const res = await settle(api.insights());
  if (!res.ok) return exportError(res.error);
  return tableResponse(request, "findings", res.value.meta.snapshot_id,
    ["headline_rank", "type", "entity", "headline", "detail", "key_number", "unit", "metric_value", "comparison_value",
     "direction", "method", "n", "p_value", "p_adjusted", "caveats", "finding_as_of", "insight_id"],
    res.value.data.map((i) => [i.headline_rank, i.type, i.entity, i.headline, i.detail, i.display?.value_text,
                               i.display?.unit_text ?? i.unit, i.metric_value, i.comparison_value, i.direction, i.method, i.n,
                               i.p_value, i.p_adjusted, i.caveats.join(" | "), i.as_of, i.insight_id]),
    res.value.meta,
    { title: "Findings, in rank order", window: "each finding states its own data window (finding_as_of is its end)",
      definitions: ["Every finding is computed by code from the published figures and passes a statistical gate before it is shown. n is the days, weeks or residents it rests on.",
                    "data_as_of and source are those of the finding's own sources."] },
    // Each finding is dated by, and credited to, the sources it uses (an access finding's clinic list is from 2024).
    (i) => findingMeta(res.value.data[i]!, res.value.meta));
}
