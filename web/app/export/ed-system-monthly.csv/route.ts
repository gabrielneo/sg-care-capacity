/** The monthly average across the full EDs MOH reported throughout (?months=36, 1 to 120). */
import { api, settle } from "@/lib/api/client";
import { BED_WAIT_EXPLAINER, BED_WAIT_LABEL, CAVEAT } from "@/lib/copy";
import { exportError, tableResponse } from "@/lib/exportRoutes";

export async function GET(request: Request) {
  const asked = Number(new URL(request.url).searchParams.get("months") ?? "36");
  const months = Number.isInteger(asked) && asked >= 1 && asked <= 120 ? asked : 36;
  const res = await settle(api.edSystemMonthly({ months }));
  if (!res.ok) return exportError(res.error);
  return tableResponse(request, "ed-system-monthly", res.value.meta.snapshot_id,
    ["year", "month", "n_hospitals", "n_complete_hospitals", "is_complete_month", "mean_of_hospital_mean_wait_hours", "total_attendances",
     "wait_yoy_pct", "attendances_yoy_pct", "wait_mom_pct", "attendances_mom_pct"],
    res.value.data.map((m) => [m.year, m.month, m.n_hospitals, m.n_complete_hospitals, m.is_complete_month, m.mean_of_hospital_mean_wait_hours,
                               m.total_attendances, m.wait_yoy_pct, m.attendances_yoy_pct, m.wait_mom_pct, m.attendances_mom_pct]),
    res.value.meta,
    { title: `${BED_WAIT_LABEL}, average of the full EDs, by month`, window: `the latest ${months} calendar months`,
      definitions: [BED_WAIT_EXPLAINER, CAVEAT.edVisits,
        "The group is the full emergency departments MOH reported throughout; Alexandra Hospital (an urgent care centre) and Woodlands Hospital (reported from 23 June 2024) are left out, so the line does not step when a site joins.",
        "A month has figures only when every hospital in the group has it complete; every hospital counts equally."] });
}
