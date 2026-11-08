/**
 * The 3D access map's logic, kept out of the WebGL component so it can be tested: heights, colours,
 * shapes, the view choice and the tooltip text. Coordinates come from the API's SVY21 layer in
 * metres around Singapore's centre, so nothing here projects anything.
 */
import type { Svy21Collection } from "./api/types";
import { colors } from "./palette";
import { classColors, classify, type LegendClass, legendClasses, quantileBreaks } from "./quantiles";

export type Svy21Feature = Svy21Collection["features"][number];
export type Svy21Props = Svy21Feature["properties"];

/** Height is linear in residents aged 65+: one step per 10,000 (stated in the legend). */
export const SENIORS_PER_STEP = 10_000;
export const METRES_PER_STEP = 450;
/** Areas left out of the ranking (too few seniors) are drawn flat and grey. */
export const FLAT_METRES = 40;
export const EXCLUDED_COLOUR = colors["map-none"];

export function heightOf(p: Pick<Svy21Props, "residents_65plus" | "excluded_reason">): number {
  if (p.excluded_reason || p.residents_65plus == null) return FLAT_METRES;
  return (p.residents_65plus / SENIORS_PER_STEP) * METRES_PER_STEP;
}

/** Steps on the legend's height scale: enough to reach the tallest area. */
export function heightSteps(maxSeniors: number): number {
  return Math.max(1, Math.ceil(maxSeniors / SENIORS_PER_STEP));
}

export type Point2 = [number, number];
export interface Rings {
  outer: Point2[];
  holes: Point2[][];
}

/** A Polygon or MultiPolygon as outer rings with their holes (GeoJSON order: outer first). */
export function polygons(geometry: Svy21Feature["geometry"]): Rings[] {
  const toRing = (ring: unknown): Point2[] => (ring as number[][]).map(([x, y]) => [x as number, y as number]);
  const one = (poly: unknown[]): Rings => ({ outer: toRing(poly[0]), holes: poly.slice(1).map(toRing) });
  return geometry.type === "Polygon" ? [one(geometry.coordinates)] : (geometry.coordinates as unknown[][]).map(one);
}

export interface AreaStyle {
  code: string;
  name: string;
  height: number;
  color: string;
  excluded: boolean;
  props: Svy21Props;
}

/**
 * Colour: CDMP GP clinics per 1,000 residents aged 65+, in five groups with equal numbers of the
 * ranked areas, darker = fewer clinics (the site's rule: darker = worse access). Excluded areas are
 * grey and take no part in the groups.
 */
export function styleAreas(features: Svy21Feature[]): {
  areas: AreaStyle[]; classes: LegendClass[]; excluded: number; maxSeniors: number } {
  const ranked = features.filter((f) => !f.properties.excluded_reason);
  const rates = ranked.map((f) => f.properties.cdmp_clinics_per_1k_seniors);
  const breaks = quantileBreaks(rates);
  const palette = classColors(breaks.length + 1, true);
  const areas = features.map((f) => {
    const p = f.properties;
    const excluded = !!p.excluded_reason;
    const cls = excluded ? -1 : classify(p.cdmp_clinics_per_1k_seniors, breaks);
    return { code: p.planning_area_code, name: p.planning_area, height: heightOf(p), excluded, props: p,
             color: cls === -1 ? EXCLUDED_COLOUR : (palette[cls] as string) };
  });
  return { areas, classes: legendClasses(rates, breaks, true), excluded: features.length - ranked.length,
           maxSeniors: Math.max(0, ...features.map((f) => f.properties.residents_65plus ?? 0)) };
}

/** The tooltip's shortfall line, rounded as in the findings ("about 13 fewer"). */
export function shortfallText(p: Pick<Svy21Props, "cdmp_shortfall" | "excluded_reason">): string {
  if (p.excluded_reason) return `Not ranked: ${p.excluded_reason}`;
  if (p.cdmp_shortfall == null) return "No shortfall figure";
  const n = Math.round(Math.abs(p.cdmp_shortfall));
  if (n === 0) return "About the same as the national rate";
  const clinics = `chronic-care ${n === 1 ? "clinic" : "clinics"}`;
  return p.cdmp_shortfall > 0 ? `About ${n} fewer ${clinics} than the national rate would give`
    : `About ${n} more ${clinics} than the national rate would give`;
}

// ------------------------------------------------------------------ view choice

export interface Capabilities {
  webgl: boolean;
  reducedMotion: boolean;
  /** navigator.deviceMemory below LOW_MEMORY_GB (Chromium only; unknown counts as enough). */
  lowMemory: boolean;
}

export const LOW_MEMORY_GB = 4;

export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function detectCapabilities(): Capabilities {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return {
    webgl: webglAvailable(),
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    lowMemory: typeof memory === "number" && memory < LOW_MEMORY_GB,
  };
}

export type Requested = "auto" | "3d" | "2d";

/**
 * Which map to show, and why when it isn't the 3D one. 3D needs WebGL whatever was asked for.
 * Without a request, reduced motion or low memory also mean the 2D map; asking for 3D overrides those.
 */
export function chooseView(requested: Requested, c: Capabilities): { view: "3d" | "2d"; reason: string | null } {
  if (requested === "2d") return { view: "2d", reason: null };
  if (!c.webgl) return { view: "2d", reason: "This browser can't draw 3D graphics (no WebGL), so the 2D map is shown." };
  if (requested === "3d") return { view: "3d", reason: null };
  if (c.reducedMotion) return { view: "2d", reason: "Reduced motion is on, so the 2D map is shown." };
  if (c.lowMemory) return { view: "2d", reason: "This device reports little memory, so the 2D map is shown." };
  return { view: "3d", reason: null };
}

// ------------------------------------------------------------------ camera

export const FOV = 35;                          // degrees, vertical
const ISLAND_WIDTH_M = 50_000;                  // what must fit across, east to west (with a margin)
const ISLAND_DEPTH_M = 34_000;                  // and top to bottom, seen from above
const ELEVATION = 0.95;                         // radians above the horizon at the end of the intro (~54°)
export const INTRO_MS = 1600;

/** How far the camera stands so the whole island fits a canvas of this width / height. */
export function fitDistance(aspect: number): number {
  const t = Math.tan((FOV * Math.PI) / 360);
  return Math.max(ISLAND_DEPTH_M / (2 * t), ISLAND_WIDTH_M / (2 * t * Math.max(aspect, 0.3)));
}

type Vec3 = [number, number, number];

/** Where the intro move ends: oblique, from the south, at distance d. */
export function cameraEnd(d: number): Vec3 {
  return [0, d * Math.sin(ELEVATION), d * Math.cos(ELEVATION)];
}

/** Where it starts: straight down from a little higher. (z = 1 m keeps "up" well defined.) */
export function cameraStart(d: number): Vec3 {
  return [0, d * 1.15, 1];
}

export const easeOutCubic = (t: number) => 1 - (1 - Math.min(Math.max(t, 0), 1)) ** 3;

/** The camera position t ms into the intro move. */
export function introPosition(t: number, d: number): Vec3 {
  const k = easeOutCubic(t / INTRO_MS);
  const a = cameraStart(d);
  const b = cameraEnd(d);
  return a.map((v, i) => v + ((b[i] as number) - v) * k) as Vec3;
}
