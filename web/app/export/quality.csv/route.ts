/** Every data-quality check of this release and its result. */
import { api, settle } from "@/lib/api/client";
import { CAVEAT } from "@/lib/copy";
import { exportError, tableResponse } from "@/lib/exportRoutes";

export async function GET(request: Request) {
  const res = await settle(api.quality());
  if (!res.ok) return exportError(res.error);
  return tableResponse(request, "quality", res.value.meta.snapshot_id,
    ["check_id", "table", "severity", "status", "failing_rows", "blocks_publish", "scope", "details"],
    res.value.data.results.map((r) => [r.check_id, r.table, r.severity, r.status, r.failing_rows, r.blocks_publish, r.scope, r.details]),
    res.value.meta,
    { title: "Data-quality check results", window: `the checks that published this data release (run ${res.value.data.run_id})`,
      definitions: [CAVEAT.quality, "ERROR checks set rows aside (or block publishing when blocks_publish is true); WARN checks flag for review. Each check is explained in docs/data_quality.md."] });
}
