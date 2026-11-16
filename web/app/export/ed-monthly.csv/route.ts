/** The monthly figures per hospital (?months=36, 1 to 120; ?hospital=SGH for one). */
import { api, settle } from "@/lib/api/client";
import { BED_WAIT_EXPLAINER, BED_WAIT_LABEL, CAVEAT } from "@/lib/copy";
import { exportError, tableResponse } from "@/lib/exportRoutes";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const asked = Number(url.searchParams.get("months") ?? "36");
  const months = Number.isInteger(asked) && asked >= 1 && asked <= 120 ? asked : 36;
  const hospital = url.searchParams.get("hospital")?.trim().toUpperCase() || undefined;
  const res = await settle(api.edMonthly({ months, hospital }));
  if (!res.ok) return exportError(res.error);
  return tableResponse(request, "ed-monthly", res.value.meta.snapshot_id,
    ["hospital_code", "hospital_name", "year", "month", "mean_of_daily_median_wait_hours", "total_attendances", "days_reported_wait",
     "days_reported_attendances", "days_in_month", "is_complete_month", "wait_yoy_pct", "attendances_yoy_pct", "wait_mom_pct", "attendances_mom_pct"],
    res.value.data.map((m) => [m.hospital_code, m.hospital_name, m.year, m.month, m.mean_of_daily_median_wait_hours, m.total_attendances,
                               m.days_reported_wait, m.days_reported_attendances, m.days_in_month, m.is_complete_month, m.wait_yoy_pct,
                               m.attendances_yoy_pct, m.wait_mom_pct, m.attendances_mom_pct]),
    res.value.meta,
    { title: `${BED_WAIT_LABEL}, by month`, window: `the latest ${months} calendar months`,
      definitions: [BED_WAIT_EXPLAINER, CAVEAT.edVisits, "A month's wait is the average of its daily medians. A change against the month a year before (or the month before) is given only when both months are complete; a missing change is empty, never 0."] });
}
