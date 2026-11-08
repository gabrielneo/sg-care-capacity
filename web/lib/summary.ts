/**
 * The printable one-page summary (requirement S4): the priority areas, in the insight engine's own
 * order, with the figures the Access Map shows for them. Nothing is re-ranked or re-derived here.
 */
import type { AreaCollection } from "./api/types";

type Props = AreaCollection["features"][number]["properties"];

export interface SummaryArea {
  rank: number;
  name: string;
  seniors: number | null;
  rate: number | null;
  /** The pipeline's shortfall; null when it has none (shown as missing, never 0). */
  shortfall: number | null;
}

export const SUMMARY_AREAS = 5;

/** The first `max` priority areas, in rank order. An area missing from the data keeps its rank, with no figures. */
export function summaryAreas(priority: string[], areas: Props[], max = SUMMARY_AREAS): SummaryArea[] {
  const byName = new Map(areas.map((p) => [p.planning_area, p]));
  return priority.slice(0, max).map((name, i) => {
    const p = byName.get(name);
    return { rank: i + 1, name, seniors: p?.residents_65plus ?? null, rate: p?.cdmp_clinics_per_1k_seniors ?? null,
             shortfall: p?.cdmp_shortfall ?? null };
  });
}
