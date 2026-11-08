/**
 * The two charts beside the access map, from the same data as the map and the access-gap findings:
 * a quadrant of seniors against CDMP clinics per senior, and the priority areas' shortfall. The
 * shortfall is the pipeline's (the insight engine's own code); nothing is re-derived here.
 */
import type { AreaCollection, Insight } from "./api/types";

type Props = AreaCollection["features"][number]["properties"];

/** The access-gap findings' areas, in the engine's priority order (the API ranks them). */
export function priorityAreas(insights: Insight[]): string[] {
  return insights.filter((i) => i.type === "access_gap").map((i) => i.entity);
}

export interface QuadrantPoint {
  name: string;
  seniors: number;
  rate: number;
  /** 1-based priority rank among the findings, or null. */
  rank: number | null;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length / 2;
  return s.length % 2 ? (s[Math.floor(m)] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

/**
 * Ranked areas only (enough seniors for a stable ratio). The dividing lines are the medians of the
 * ranked areas, the 50th percentiles the engine's priority score is built from.
 */
export function quadrant(areas: Props[], priority: string[]): { points: QuadrantPoint[]; medianSeniors: number; medianRate: number } | null {
  const ranked = areas.filter((p) => !p.excluded_reason && p.residents_65plus != null && p.cdmp_clinics_per_1k_seniors != null);
  if (ranked.length === 0) return null;
  const points = ranked.map((p) => {
    const i = priority.indexOf(p.planning_area);
    return { name: p.planning_area, seniors: p.residents_65plus as number, rate: p.cdmp_clinics_per_1k_seniors as number,
             rank: i === -1 ? null : i + 1 };
  });
  return { points, medianSeniors: median(points.map((p) => p.seniors)), medianRate: median(points.map((p) => p.rate)) };
}

export interface ShortfallBar {
  name: string;
  shortfall: number;
  rank: number;
}

/** The priority areas' shortfall, largest first. Areas without a figure are left out, not zeroed. */
export function shortfallBars(areas: Props[], priority: string[]): ShortfallBar[] {
  const byName = new Map(areas.map((p) => [p.planning_area, p]));
  return priority
    .map((name, i) => ({ name, shortfall: byName.get(name)?.cdmp_shortfall ?? null, rank: i + 1 }))
    .filter((b): b is ShortfallBar => b.shortfall != null)
    .sort((a, b) => b.shortfall - a.shortfall || a.rank - b.rank);
}
