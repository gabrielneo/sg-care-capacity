/**
 * The heatmap's colour key: one label per class, built from the class edges (lib/edCompare.ts) so the key and
 * the cells can never disagree. "usual" mode runs −m to +m about the hospital's own average; "raw" is hours.
 */
import { type ColourClass } from "./edCompare";

const fmt = (v: number, digits: number) => Math.abs(v).toLocaleString("en-SG", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const sign = (v: number, digits: number) => (Number(fmt(v, digits)) === 0 ? fmt(v, digits) : `${v > 0 ? "+" : "−"}${fmt(v, digits)}`);

/** "−61 to −44%" for a class of differences; "0.0–2.5 h" for hours. The middle class reads "−9 to +9%", never a bare "0%". */
export function legendLabel(c: ColourClass, mode: "usual" | "raw"): string {
  if (mode === "raw") return `${fmt(c.min, 1)}–${fmt(c.max, 1)} h`;
  // Whole percentages unless the bins are narrower than 1 point, where they would all read "0 to 0%".
  const width = c.max - c.min;
  const digits = width >= 1 ? 0 : width >= 0.1 ? 1 : 2;
  return `${sign(c.min, digits)} to ${sign(c.max, digits)}%`;
}

export const legendLabels = (classes: ColourClass[], mode: "usual" | "raw"): string[] => classes.map((c) => legendLabel(c, mode));

/** The captions at the two ends of the scale. */
export const legendEnds = (mode: "usual" | "raw"): [string, string] =>
  mode === "usual" ? ["Shorter than usual", "Longer than usual"] : ["Shorter bed wait", "Longer bed wait"];
