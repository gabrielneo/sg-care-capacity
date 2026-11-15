/** Each NUHS site's latest adult-ED estimate beside MOH's latest daily median for the same hospital. Two measures, two dates. */
import { api, settle } from "@/lib/api/client";
import { BED_WAIT_EXPLAINER, CAVEAT } from "@/lib/copy";
import { slopePairs } from "@/lib/edCompare";
import { exportError, tableResponse } from "@/lib/exportRoutes";

export async function GET(request: Request) {
  const base = await settle(Promise.all([api.liveNuhsLatest(), api.edDaily()]));
  if (!base.ok) return exportError(base.error);
  const [live, daily] = base.value;
  const pairs = slopePairs(daily.data, live.data);
  // Each source keeps its own date: the NUHS reading's time, and MOH's.
  const meta = { as_of: daily.meta.as_of, sources: [...live.meta.sources, ...daily.meta.sources.filter((s) => s.id === "moh_bed_waits")] };
  return tableResponse(request, "nuhs-vs-moh", daily.meta.snapshot_id,
    ["hospital_code", "moh_report_date", "moh_median_bed_wait_hours", "nuhs_snapshot_at", "nuhs_est_bed_wait_hours", "nuhs_qualifier"],
    pairs.map((p) => [p.code, p.moh?.date, p.moh?.value, p.nuhs?.at, p.nuhs?.value, p.nuhs?.bound]),
    meta,
    { title: "NUHS estimate and MOH figure", window: "the latest NUHS reading and the latest MOH day for each NUHS site (different days)",
      definitions: [BED_WAIT_EXPLAINER, CAVEAT.live, "The two are different measures on different days: NUHS's is an estimate at one moment, MOH's is the daily median of admitted patients."] });
}
