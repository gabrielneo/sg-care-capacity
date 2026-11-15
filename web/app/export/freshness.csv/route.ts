/** How current each source is, with the rule it is judged by. */
import { api, settle } from "@/lib/api/client";
import { exportError, tableResponse } from "@/lib/exportRoutes";
import { datasetFreshness } from "@/lib/freshness";

export async function GET(request: Request) {
  const res = await settle(api.meta());
  if (!res.ok) return exportError(res.error);
  const sources = res.value.meta.sources;
  return tableResponse(request, "freshness", res.value.meta.snapshot_id,
    ["source_id", "source", "source_as_of", "as_of_basis", "last_fetched_at", "freshness"],
    sources.map((s) => [s.id, s.name, s.as_of, s.as_of_basis, s.last_fetched_at, s.as_of ? datasetFreshness(s.id, s.as_of).level : "unknown"]),
    res.value.meta,
    { title: "Freshness by source", window: "this data release",
      definitions: ["Freshness is judged against how often each source is published (docs/datasets.yml): current, due an update, or overdue. An old source is flagged, not hidden."] });
}
