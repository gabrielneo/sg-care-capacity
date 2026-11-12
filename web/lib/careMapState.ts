/**
 * The hospital map's state, kept in the address (?cluster=NUHS&layout=list&hospital=SGH&sort=hours), so a
 * view can be shared and survives a reload. Pure functions: the components read and write the URL
 * through them, and a bad value is ignored, never an error.
 *
 * - cluster: a value of dim_hospital.cluster, read from the data (nothing about clusters is
 *   hard-coded here). Unknown or missing = all hospitals.
 * - layout: "map" or "list". Missing means "the default for the screen" (list on a phone, map
 *   otherwise): the CSS picks it, so nothing is guessed from the width here.
 * - hospital: a hospital code whose details are open.
 * - sort: the list's order. The same three orders as the Planner cards (lib/planner.ts).
 */
import { DEFAULT_SORT, parseSort, type Sort, sortStatuses } from "./planner";
import type { HospitalStatus } from "./status";

export type Layout = "map" | "list";

export interface CareRow extends Pick<HospitalStatus, "code" | "level" | "latest" | "usual" | "pct"> {
  name: string;
  /** dim_hospital.cluster. */
  cluster: string;
  /** dim_hospital pin; null when the release has none (the hospital is then in the list only). */
  latitude: number | null;
  longitude: number | null;
  /** Short coverage label ("Urgent care centre", "Adults only"), from lib/hospitalNotes.ts. */
  note: string | null;
}

export interface CareParams {
  cluster: string | null;
  layout: Layout | null;
  hospital: string | null;
  sort: Sort;
}

export function parseLayout(value: string | null | undefined): Layout | null {
  return value === "map" || value === "list" ? value : null;
}

/** The distinct clusters in the data, A to Z. */
export function clusterList(rows: readonly CareRow[]): string[] {
  return [...new Set(rows.map((r) => r.cluster))].sort((a, b) => a.localeCompare(b, "en"));
}

/** The data's own spelling of a requested cluster (any case), or null if the data has no such cluster. */
export function matchCluster(value: string | null | undefined, rows: readonly CareRow[]): string | null {
  const want = value?.trim().toLowerCase();
  if (!want) return null;
  return clusterList(rows).find((c) => c.toLowerCase() === want) ?? null;
}

export function parseCareParams(search: string | URLSearchParams, rows: readonly CareRow[]): CareParams {
  const q = new URLSearchParams(search);
  const code = q.get("hospital")?.trim().toUpperCase() ?? "";
  return {
    cluster: matchCluster(q.get("cluster"), rows),
    layout: parseLayout(q.get("layout")),
    hospital: rows.some((r) => r.code === code) ? code : null,
    sort: parseSort(q.get("sort")),
  };
}

export type CarePatch = Partial<{ cluster: string | null; layout: Layout | null; hospital: string | null; sort: Sort }>;

/** The query string (no "?") after a change, keeping every other parameter (?view=…). Defaults are left out. */
export function withCareParams(search: string | URLSearchParams, patch: CarePatch): string {
  const q = new URLSearchParams(search);
  const put = (key: string, value: string | null | undefined) => (value ? q.set(key, value) : q.delete(key));
  if ("cluster" in patch) put("cluster", patch.cluster);
  if ("layout" in patch) put("layout", patch.layout);
  if ("hospital" in patch) put("hospital", patch.hospital);
  if ("sort" in patch) put("sort", patch.sort === DEFAULT_SORT ? null : patch.sort);
  return q.toString();
}

export function filterByCluster<T extends { cluster: string }>(rows: readonly T[], cluster: string | null): T[] {
  return cluster ? rows.filter((r) => r.cluster === cluster) : [...rows];
}

/** The list's rows in the chosen order (the Planner cards' own sort, so the two can't disagree). */
export function sortRows(rows: readonly CareRow[], sort: Sort): CareRow[] {
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const names = Object.fromEntries(rows.map((r) => [r.code, r.name]));
  return sortStatuses(rows.map((r) => ({ ...r, spark: [] })), sort, names).map((s) => byCode.get(s.code) as CareRow);
}

/** Hospitals the map can place. */
export function pinned<T extends { latitude: number | null; longitude: number | null }>(
  rows: readonly T[]): (T & { latitude: number; longitude: number })[] {
  return rows.filter((r): r is T & { latitude: number; longitude: number } => r.latitude != null && r.longitude != null);
}
