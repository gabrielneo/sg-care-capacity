import type { LegendClass } from "./quantiles";

/**
 * The words for each map class, lowest first, said the way areas are put in them (lib/quantiles.ts: a value goes in the first
 * class whose largest value it does not exceed). The first class runs from its lowest value to its largest; every later one is
 * "over" the class below's largest value, up to its own. So the ranges meet with no gap, and an area's value is never in two.
 * Decimals start at the metric's own and go up (at most three more) only until no two boundaries print the same: two values
 * either side of a boundary can round to the same figure (1.2381 and 1.2441 are both "1.24"). Presentation only: the classes,
 * their breaks and their colours are not touched.
 */
export function classRanges(classes: readonly LegendClass[], decimals: number,
                            format: (v: number, decimals: number) => string): string[] {
  if (classes.length === 0) return [];
  let d = decimals;
  const bounds = (k: number) => [classes[0]!.min, ...classes.map((c) => c.max)].map((v) => format(v, k));
  for (; d < decimals + 3; d++) {
    const b = bounds(d);
    const clash = b.some((x, i) => i > 0 && x === b[i - 1] && (i > 1 || classes[0]!.min !== classes[0]!.max));
    if (!clash) break;
  }
  return classes.map((c, i) => {
    if (i === 0) return c.min === c.max ? format(c.min, d) : `${format(c.min, d)} to ${format(c.max, d)}`;
    return `over ${format(classes[i - 1]!.max, d)} to ${format(c.max, d)}`;
  });
}
