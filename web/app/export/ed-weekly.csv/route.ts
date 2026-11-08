/** The weekly figures behind the usual-level comparison (?weeks=10, 1 to 104). */
import { api, settle } from "@/lib/api/client";
import { csvResponse, toCsv } from "@/lib/csv";
import { exportError } from "@/lib/exportRoutes";

export async function GET(request: Request) {
  const asked = Number(new URL(request.url).searchParams.get("weeks") ?? "10");
  const weeks = Number.isInteger(asked) && asked >= 1 && asked <= 104 ? asked : 10;
  const res = await settle(api.edWeekly({ weeks }));
  if (!res.ok) return exportError(res.error);
  const body = toCsv(
    ["hospital_code", "hospital_name", "week_start", "week_end", "mean_of_daily_median_wait_hours", "total_attendances",
     "days_reported_wait", "days_reported_attendances", "is_complete_week"],
    res.value.data.map((w) => [w.hospital_code, w.hospital_name, w.week_start, w.week_end, w.mean_of_daily_median_wait_hours,
                               w.total_attendances, w.days_reported_wait, w.days_reported_attendances, w.is_complete_week]),
    res.value.meta);
  return csvResponse(body, "ed-weekly", res.value.meta.snapshot_id);
}
