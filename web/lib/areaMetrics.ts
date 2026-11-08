/** The map's metrics (columns of marts.fct_area_access; see docs/data_dictionary.md). */
import type { AreaCollection } from "./api/types";

export type AreaProps = AreaCollection["features"][number]["properties"];

export type MetricKey =
  | "clinics_per_1k_seniors"
  | "cdmp_clinics_per_1k_seniors"
  | "pct_area_within_1km_of_cdmp"
  | "approx_km_centroid_to_nearest_polyclinic";

export interface AreaMetric {
  key: MetricKey;
  label: string;
  unit: string;
  decimals: number;
  higherIsBetter: boolean;
  /** The legend's reading of the shading. Darker is always worse access. */
  darker: string;
  /** dim_metric id, for its caveat. */
  metricId: string;
}

export const AREA_METRICS: readonly AreaMetric[] = [
  { key: "clinics_per_1k_seniors", label: "CHAS GP clinics per 1,000 residents aged 65+", unit: "per 1,000 aged 65+",
    decimals: 2, higherIsBetter: true, darker: "Darker means fewer clinics per senior: worse access.",
    metricId: "fct_area_access.clinics_per_1k_seniors" },
  { key: "cdmp_clinics_per_1k_seniors", label: "CDMP GP clinics per 1,000 residents aged 65+", unit: "per 1,000 aged 65+",
    decimals: 2, higherIsBetter: true, darker: "Darker means fewer chronic-care clinics per senior: worse access.",
    metricId: "fct_area_access.cdmp_clinics_per_1k_seniors" },
  { key: "pct_area_within_1km_of_cdmp", label: "Share of land within 1 km of a CDMP clinic", unit: "% of land",
    decimals: 0, higherIsBetter: true, darker: "Darker means less land near a CDMP clinic: worse access.",
    metricId: "fct_area_access.pct_area_within_1km_of_cdmp" },
  { key: "approx_km_centroid_to_nearest_polyclinic", label: "Approximate distance from the centre of the area to the nearest polyclinic",
    unit: "km", decimals: 1, higherIsBetter: false, darker: "Darker means farther: worse access.",
    metricId: "fct_area_access.approx_km_centroid_to_nearest_polyclinic" },
];

export const DEFAULT_METRIC: MetricKey = "clinics_per_1k_seniors";

export function metricByKey(key: string | undefined): AreaMetric {
  return AREA_METRICS.find((m) => m.key === key) ?? (AREA_METRICS[0] as AreaMetric);
}

export function formatValue(value: number | null | undefined, decimals: number): string {
  if (value == null || !Number.isFinite(value)) return "No data";
  return value.toLocaleString("en-SG", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Shown for a per-senior ratio in an area with no residents aged 65+: undefined, not missing (audit L-5). */
export const NOT_APPLICABLE = "n/a (no residents)";

/** A metric's text for one area: "n/a (no residents)" where a per-senior ratio is undefined, else formatValue. */
export function areaValueText(area: Partial<AreaProps>, key: string, decimals: number): string {
  if (key.includes("per_1k") && area.residents_65plus === 0) return NOT_APPLICABLE;
  return formatValue(area[key as keyof AreaProps] as number | null | undefined, decimals);
}

/** Table columns, in order. */
export const TABLE_COLUMNS = [
  { key: "planning_area", label: "Area", numeric: false, decimals: 0 },
  { key: "region_name", label: "Region", numeric: false, decimals: 0 },
  { key: "residents_65plus", label: "Residents aged 65+", numeric: true, decimals: 0 },
  { key: "chas_clinics", label: "CHAS GP clinics", numeric: true, decimals: 0 },
  { key: "cdmp_clinics", label: "CDMP GP clinics", numeric: true, decimals: 0 },
  { key: "clinics_per_1k_seniors", label: "CHAS GP clinics per 1,000 aged 65+", numeric: true, decimals: 2 },
  { key: "cdmp_clinics_per_1k_seniors", label: "CDMP GP clinics per 1,000 aged 65+", numeric: true, decimals: 2 },
  { key: "pct_area_within_1km_of_cdmp", label: "% of land within 1 km of a CDMP clinic", numeric: true, decimals: 0 },
  { key: "approx_km_centroid_to_nearest_polyclinic", label: "Approx. distance to nearest polyclinic (km)", numeric: true, decimals: 1 },
] as const;

export type SortKey = (typeof TABLE_COLUMNS)[number]["key"];

/** Sort rows by a column; missing values always go last, whichever the direction. */
export function sortAreas(rows: AreaProps[], key: string | undefined, dir: string | undefined): {
  rows: AreaProps[]; key: SortKey; dir: "asc" | "desc" } {
  const col = TABLE_COLUMNS.find((c) => c.key === key) ?? TABLE_COLUMNS[0];
  const d = dir === "desc" ? "desc" : "asc";
  const sign = d === "asc" ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    const x = a[col.key as keyof AreaProps];
    const y = b[col.key as keyof AreaProps];
    if (x == null && y == null) return a.planning_area.localeCompare(b.planning_area);
    if (x == null) return 1;
    if (y == null) return -1;
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return c === 0 ? a.planning_area.localeCompare(b.planning_area) : sign * c;
  });
  return { rows: sorted, key: col.key, dir: d };
}
