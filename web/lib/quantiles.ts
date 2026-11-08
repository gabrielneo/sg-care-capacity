/**
 * Quantile class breaks for the map. Method (stated in the legend): sort the areas that have a
 * value, cut them into k groups of (as near as possible) equal size; each break is the largest
 * value in its group. Equal breaks (ties) are merged, so there may be fewer than k classes.
 * Areas with no value are never classed: they are "no data".
 */
import { mapScale } from "./palette";

export function quantileBreaks(values: ReadonlyArray<number | null | undefined>, k = 5): number[] {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return [];
  const breaks: number[] = [];
  for (let i = 1; i < k; i++) {
    const b = v[Math.max(0, Math.ceil((i * v.length) / k) - 1)] as number;
    if (b < (v.at(-1) as number) && (breaks.length === 0 || b > (breaks.at(-1) as number))) breaks.push(b);
  }
  return breaks;
}

/** Class index 0..breaks.length for a value (<= break i -> class i), or -1 for no data. */
export function classify(value: number | null | undefined, breaks: readonly number[]): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return -1;
  const i = breaks.findIndex((b) => value <= b);
  return i === -1 ? breaks.length : i;
}

export interface LegendClass {
  index: number;
  min: number;
  max: number;
  count: number;
  color: string;
}

/**
 * Colours for n classes, lowest value first, spread across the 5-step scale so the ends stay light
 * and dark. The site's rule: darker = worse access. So when a higher value is better (more clinics),
 * the lowest class is the darkest (lowIsDark); when a higher value is worse (distance), it is the lightest.
 */
export function classColors(n: number, lowIsDark = false): string[] {
  if (n <= 0) return [];
  if (n === 1) return [mapScale[2]];
  const out = Array.from({ length: n }, (_, i) => mapScale[Math.round((i * (mapScale.length - 1)) / (n - 1))] as string);
  return lowIsDark ? out.reverse() : out;
}

export function legendClasses(values: ReadonlyArray<number | null | undefined>, breaks: readonly number[],
                              lowIsDark = false): LegendClass[] {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (v.length === 0) return [];
  const n = breaks.length + 1;
  const colors = classColors(n, lowIsDark);
  return Array.from({ length: n }, (_, i) => {
    const members = v.filter((x) => classify(x, breaks) === i);
    return { index: i, min: Math.min(...members), max: Math.max(...members), count: members.length, color: colors[i] as string };
  }).filter((c) => c.count > 0);
}
