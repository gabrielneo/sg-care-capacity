/** NUHS's latest estimates for each site and department, as the Live page shows them. Estimates, not MOH's median. */
import { api, settle } from "@/lib/api/client";
import { CAVEAT } from "@/lib/copy";
import { exportError, tableResponse } from "@/lib/exportRoutes";

export async function GET(request: Request) {
  const res = await settle(api.liveNuhsLatest());
  if (!res.ok) return exportError(res.error);
  return tableResponse(request, "live", res.value.meta.snapshot_id,
    ["site_name", "department", "hospital_code", "is_adult_ed", "patients_waiting", "est_wait_to_see_doctor_hours", "est_wait_to_see_doctor_qualifier",
     "est_bed_wait_hours", "est_bed_wait_qualifier", "snapshot_at"],
    res.value.data.map((r) => [r.site_name, r.department, r.hospital_code, r.is_adult_ed, r.patients_waiting, r.est_wait_to_see_doctor_hours,
                               r.est_wait_to_see_doctor_qualifier, r.est_bed_wait_hours, r.est_bed_wait_qualifier, r.snapshot_at]),
    res.value.meta,
    { title: "NUHS estimates by site", window: "the latest reading of each site and department (up to 7 days old)",
      definitions: [CAVEAT.live, CAVEAT.childrensEmergency,
                    "A qualifier of < or > means NUHS gave a bound (\"< 1 hour\"), not a value; the hours column then holds the bound."] });
}
