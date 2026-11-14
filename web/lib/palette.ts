/**
 * Colour tokens for code that cannot read CSS variables (three.js, the share image, tests). styles/tokens.css is
 * the source of truth; lib/palette.test.ts fails if the two differ. Everything that CAN use a variable
 * (HTML, SVG, Leaflet paths) uses `cssColors`, so it follows the light/dark theme.
 *
 * "Paper & Ink" (docs/design/redesign_brief.md): warm paper, ink text, one ink-blue accent for the interface
 * only. Status colours always come with a symbol and words. Orange/brown = longer waits, violet = shorter.
 * The data scales (map, div) are the same in both themes: a Viridis sequential scale for the access maps
 * (data, never interface) and a ColorBrewer PuOr diverging scale (violet below 0, orange above).
 */
const data = {
  "map-1": "#FDE725", "map-2": "#5EC962", "map-3": "#21918C", "map-4": "#3B528B", "map-5": "#440154",
  "map-none": "#E2E8F0",
  "div-1": "#542788", "div-2": "#998EC3", "div-3": "#D8DAEB", "div-4": "#F7F7F7",
  "div-5": "#FEE0B6", "div-6": "#F1A340", "div-7": "#B35806",
  "on-data-dark": "#12141B", "on-data-light": "#FFFCF7",
} as const;

export const colors = {
  page: "#F6F1E8", band: "#EEE7DA", surface: "#FFFCF7", sunken: "#F1EBE0",
  line: "#DDD3C2", control: "#857A69",
  ink: "#1F2330", muted: "#4F5563", tertiary: "#5F636D",
  accent: "#2E4A7D", "accent-strong": "#22385F", "accent-soft": "#E3E8F2",
  "status-much": "#A8322A", "status-much-soft": "#F7E1DC",
  "status-higher": "#8F5A12", "status-higher-soft": "#F5E7CF",
  "status-usual": "#4F5563", "status-usual-soft": "#ECE7DE",
  "status-lower": "#5B4A8B", "status-lower-soft": "#E7E2F2",
  danger: "#A8322A", "danger-soft": "#F9E6E2",
  ...data,
} as const;

/** The dark theme's values for every token that differs from light (the data scales do not). */
export const darkColors = {
  ...colors,
  page: "#15171C", band: "#1B1E24", surface: "#20232A", sunken: "#191C21",
  line: "#2E323A", control: "#7A766E",
  ink: "#EDE7DC", muted: "#B8B2A7", tertiary: "#9A958C",
  accent: "#8FB0E8", "accent-strong": "#B0C8F0", "accent-soft": "#243149",
  "status-much": "#F08A7E", "status-much-soft": "#413337",
  "status-higher": "#E0A955", "status-higher-soft": "#3F3831",
  "status-usual": "#B8B2A7", "status-usual-soft": "#383A3E",
  "status-lower": "#B3A3E6", "status-lower-soft": "#383748",
  danger: "#F08A7E", "danger-soft": "#413337",
} as const;

export type ColorToken = keyof typeof colors;

/** Palette name -> the CSS variable in styles/tokens.css. */
export const TOKEN_VARS: Record<ColorToken, string> = {
  page: "--bg-page", band: "--bg-band", surface: "--bg-surface", sunken: "--bg-sunken",
  line: "--border-subtle", control: "--border-control",
  ink: "--text-primary", muted: "--text-secondary", tertiary: "--text-tertiary",
  accent: "--accent", "accent-strong": "--accent-hover", "accent-soft": "--accent-soft",
  "status-much": "--status-much", "status-much-soft": "--status-much-fill",
  "status-higher": "--status-higher", "status-higher-soft": "--status-higher-fill",
  "status-usual": "--status-usual", "status-usual-soft": "--status-usual-fill",
  "status-lower": "--status-lower", "status-lower-soft": "--status-lower-fill",
  danger: "--danger-notice", "danger-soft": "--danger-notice-fill",
  "map-1": "--map-1", "map-2": "--map-2", "map-3": "--map-3", "map-4": "--map-4", "map-5": "--map-5",
  "map-none": "--map-none",
  "div-1": "--div-1", "div-2": "--div-2", "div-3": "--div-3", "div-4": "--div-4",
  "div-5": "--div-5", "div-6": "--div-6", "div-7": "--div-7",
  "on-data-dark": "--on-data-dark", "on-data-light": "--on-data-light",
};

/** `var(--token)` strings: valid in SVG presentation attributes and Leaflet path options, and they follow the theme. */
export const cssColors = Object.fromEntries(
  Object.entries(TOKEN_VARS).map(([k, v]) => [k, `var(${v})`]),
) as Record<ColorToken, string>;

/** Map classes from low to high. "No data" is never one of these: it is map-none, hatched. */
export const mapScale = [colors["map-1"], colors["map-2"], colors["map-3"], colors["map-4"], colors["map-5"]] as const;

/** Differences from 0, most below first: the middle class (div-4) is centred on 0. */
export const divergingScale = [colors["div-1"], colors["div-2"], colors["div-3"], colors["div-4"], colors["div-5"],
                               colors["div-6"], colors["div-7"]] as const;

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
