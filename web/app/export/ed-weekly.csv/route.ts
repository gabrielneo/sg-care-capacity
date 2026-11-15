/** The weekly figures behind the usual-level comparison (?weeks=10, 1 to 104). */
import { api, settle } from "@/lib/api/client";
import { BED_WAIT_EXPLAINER, BED_WAIT_LABEL, CAVEAT } from "@/lib/copy";
import { USUAL_WEEKS } from "@/lib/windows";
import { exportError, tableResponse } from "@/lib/exportRoutes";

export async function GET(request: Request) {
  const asked = Number(new URL(request.url).searchParams.get("weeks") ?? "10");
  const weeks = Number.isInteger(asked) && asked >= 1 && asked <= 104 ? asked : 10;
  const res = await settle(api.edWeekly({ weeks }));
  if (!res.ok) return exportError(res.error);
  return tableResponse(request, "ed-weekly", res.value.meta.snapshot_id,
    ["hospital_code", "hospital_name", "week_start", "week_end", "mean_of_daily_median_wait_hours", "total_attendances",
     "days_reported_wait", "days_reported_attendances", "is_complete_week"],
    res.value.data.map((w) => [w.hospital_code, w.hospital_name, w.week_start, w.week_end, w.mean_of_daily_median_wait_hours,
                               w.total_attendances, w.days_reported_wait, w.days_reported_attendances, w.is_complete_week]),
    res.value.meta,
    { title: `${BED_WAIT_LABEL}, weekly`, window: `the latest ${weeks} weeks (ISO weeks, Monday to Sunday)`,
      definitions: [BED_WAIT_EXPLAINER, CAVEAT.weeklyAverage, `is_complete_week: all 7 days of both measures are in. The usual level is the median of the ${USUAL_WEEKS} complete weeks before the latest.`] });
}
