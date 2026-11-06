/**
 * Colour tokens: one source of truth, mirrored in app/globals.css (@theme). A test checks the two
 * match and that every text/background pair used meets WCAG AA.
 *
 * Neutral slate greys, ONE accent (deep teal), status colours used only with a text label, and a
 * colour-blind-safe sequential scale for the map (Viridis, 5 classes, light = low, dark = high).
 */
export const colors = {
  page: "#F8FAFC",
  surface: "#FFFFFF",
  ink: "#0F172A",
  muted: "#475569",
  line: "#CBD5E1",
  accent: "#0F766E",
  "accent-strong": "#115E59",
  "accent-soft": "#F0FDFA",
  ok: "#166534",
  "ok-soft": "#F0FDF4",
  warn: "#92400E",
  "warn-soft": "#FFFBEB",
  bad: "#991B1B",
  "bad-soft": "#FEF2F2",
  "map-1": "#FDE725",
  "map-2": "#5EC962",
  "map-3": "#21918C",
  "map-4": "#3B528B",
  "map-5": "#440154",
  "map-none": "#E2E8F0",
} as const;

export type ColorToken = keyof typeof colors;

/** Map classes from low to high. "No data" is never one of these: it is map-none, hatched. */
export const mapScale = [colors["map-1"], colors["map-2"], colors["map-3"], colors["map-4"], colors["map-5"]] as const;

/** Text on background pairs the components use, with the WCAG AA minimum for each. */
export const TEXT_PAIRS: ReadonlyArray<readonly [fg: ColorToken, bg: ColorToken, min: number]> = [
  ["ink", "page", 4.5],
  ["ink", "surface", 4.5],
  ["muted", "page", 4.5],
  ["muted", "surface", 4.5],
  ["accent", "surface", 4.5], // links
  ["accent", "page", 4.5],
  ["accent-strong", "accent-soft", 4.5], // active nav item
  ["surface", "accent", 4.5], // text on an accent button
  ["ok", "ok-soft", 4.5],
  ["warn", "warn-soft", 4.5],
  ["bad", "bad-soft", 4.5],
  ["muted", "accent-soft", 4.5],
];

/** Non-text UI that must be distinguishable (WCAG 1.4.11): 3:1 against what is next to it. */
export const UI_PAIRS: ReadonlyArray<readonly [fg: ColorToken, bg: ColorToken, min: number]> = [
  ["accent", "surface", 3], // focus ring
  ["accent", "page", 3],
];

function channel(hex: string, i: number): number {
  const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2 relative luminance and contrast ratio. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
