/**
 * A planning-area map as plain SVG paths, built on the server from the SVY21 geometry (metres). No Leaflet, no tiles, no script:
 * the landing page's map ships as HTML. The shading is lib/map3d.ts's (CDMP clinics per 1,000 residents aged 65+, darker = fewer).
 */
import type { AreaStyle, Svy21Feature } from "./map3d";
import { polygons, type Point2 } from "./map3d";

export interface StaticShape {
  code: string;
  name: string;
  d: string;
  color: string;
  excluded: boolean;
}

export interface StaticMap {
  width: number;
  height: number;
  shapes: StaticShape[];
}

/** One drawing unit is this many metres: coarse enough to keep the page light, fine enough that the island still reads. */
export const METRES_PER_UNIT = 25;

const ring = (points: Point2[], toX: (x: number) => number, toY: (y: number) => number): string => {
  const out: string[] = [];
  let last = "";
  for (const [x, y] of points) {
    const p = `${toX(x)} ${toY(y)}`;
    if (p !== last) out.push(p);
    last = p;
  }
  return out.length < 3 ? "" : `M${out.join("L")}Z`;
};

/** The shapes of the areas, north up, in one drawing. `styled` is lib/map3d.ts styleAreas(features).areas, in the same order. */
export function staticMap(features: readonly Svy21Feature[], styled: readonly AreaStyle[]): StaticMap | null {
  const all = features.flatMap((f) => polygons(f.geometry));
  const pts = all.flatMap((r) => r.outer);
  if (!pts.length) return null;
  const minX = Math.min(...pts.map((p) => p[0]));
  const maxY = Math.max(...pts.map((p) => p[1]));
  const minY = Math.min(...pts.map((p) => p[1]));
  const toX = (x: number) => Math.round((x - minX) / METRES_PER_UNIT);
  const toY = (y: number) => Math.round((maxY - y) / METRES_PER_UNIT);
  const width = Math.max(...pts.map((p) => toX(p[0])));
  const height = toY(minY);
  const shapes = features.flatMap((f, i) => {
    const style = styled[i];
    if (!style) return [];
    const d = polygons(f.geometry).flatMap((r) => [ring(r.outer, toX, toY), ...r.holes.map((h) => ring(h, toX, toY))]).filter(Boolean).join("");
    return d ? [{ code: style.code, name: style.name, d, color: style.color, excluded: style.excluded }] : [];
  });
  return { width, height, shapes };
}
