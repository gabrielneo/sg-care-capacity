/** The daily MOH figures behind ED Trends, for the same hospitals and dates (?hospital=SGH&from=…&to=…). */
import { api, settle } from "@/lib/api/client";
import { BED_WAIT_EXPLAINER, BED_WAIT_LABEL } from "@/lib/copy";
import { parseEdFilters } from "@/lib/edParams";
import { exportError, tableResponse } from "@/lib/exportRoutes";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const hospitals = await settle(api.hospitals());
  if (!hospitals.ok) return exportError(hospitals.error);
  const params = Object.fromEntries(["from", "to"].map((k) => [k, url.searchParams.get(k) ?? undefined]));
  const filters = parseEdFilters({ ...params, hospital: url.searchParams.getAll("hospital") },
                                 hospitals.value.data.map((h) => h.hospital_code));
  const res = await settle(api.edDaily({ from: filters.from ?? undefined, to: filters.to ?? undefined }));
  if (!res.ok) return exportError(res.error);
  const rows = res.value.data.filter((r) => !filters.hospitals.length || filters.hospitals.includes(r.hospital_code));
  const columns = ["hospital_code", "hospital_name", "report_date", "median_wait_hours", "attendances", "is_complete_week"];
  const table = rows.map((r) => [r.hospital_code, r.hospital_name, r.report_date, r.median_wait_hours, r.attendances, r.is_complete_week]);
  return tableResponse(request, "ed-daily", res.value.meta.snapshot_id, columns, table, res.value.meta, {
    title: `${BED_WAIT_LABEL}, daily`, window: `${filters.from ?? "start"} to ${filters.to ?? "latest"}`,
    definitions: [BED_WAIT_EXPLAINER, "median_wait_hours is MOH's daily median. Alexandra Hospital is an urgent care centre; NUH is adults only."] });
}
