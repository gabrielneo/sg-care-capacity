/** The Access Map's figures for every area, including the shortfall and why an area isn't ranked. */
import { api, settle } from "@/lib/api/client";
import { CAVEAT } from "@/lib/copy";
import { exportError, tableResponse } from "@/lib/exportRoutes";

const COLUMNS = ["planning_area_code", "planning_area", "region_name", "population_year", "residents_total", "residents_65plus",
  "chas_clinics", "cdmp_clinics", "clinics_per_1k_seniors", "cdmp_clinics_per_1k_seniors", "cdmp_shortfall", "excluded_reason",
  "pct_area_within_1km_of_cdmp", "approx_km_centroid_to_nearest_polyclinic", "nearest_polyclinic", "dq_note"] as const;

export async function GET(request: Request) {
  const res = await settle(api.areasAccess());
  if (!res.ok) return exportError(res.error);
  const rows = res.value.data.features.map((f) => COLUMNS.map((c) => f.properties[c] ?? null));
  return tableResponse(request, "areas", res.value.meta.snapshot_id, [...COLUMNS], rows, res.value.meta, {
    title: "Clinic access by planning area, residents aged 65+", window: "all 55 planning areas; residents at end-June, clinics as listed",
    definitions: [CAVEAT.clinics, "cdmp_shortfall: the CDMP clinics an area would need to reach the benchmark rate per 1,000 residents aged 65+. An area with excluded_reason is not ranked."] });
}
