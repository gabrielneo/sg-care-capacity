/**
 * Colour tokens for code that cannot read CSS variables (three.js, the share image, tests). styles/tokens.css is
 * the source of truth; lib/palette.test.ts fails if the two differ. Everything that CAN use a variable
 * (HTML, SVG, Leaflet paths) uses `cssColors`, so it follows the light/dark theme.
 *
 * "Purple, electric violet and royal blue" (17 Nov 2026): royal blue for the primary action and key data marks, electric
 * violet for the interface accent, deep purple for the hero. Status colours are never a brand hue (teal lower, neutral about
 * usual, amber higher, crimson much higher) and always come with a mark and words. The data scales are the same in both
 * themes: one lavender-to-deep-royal sequential ramp for the access maps (even L* steps) and a teal-to-amber diverging
 * scale for the weekday heatmap (teal below 0, amber above).
 */
const data = {
  "map-1": "#F0E8FD",
  "map-2": "#C5B2F2",
  "map-3": "#9380E1",
  "map-4": "#6051C8",
  "map-5": "#392793",
  "map-none": "#E8E6EF",
  "div-1": "#0B5E57",
  "div-2": "#1F7A71",
  "div-3": "#A8DDD5",
  "div-4": "#F1EFF6",
  "div-5": "#F6D9A8",
  "div-6": "#E3A24B",
  "div-7": "#94480B",
  "on-data-dark": "#16122E",
  "on-data-light": "#FFFFFF",
  "brand-purple-950": "#1E1250",
  "brand-purple-700": "#5B21B6",
  "brand-violet-500": "#7C3AED",
  "brand-violet-300": "#C4B5FD",
  "brand-royal-600": "#3F5FE0",
  "brand-royal-400": "#7C93F5",
  "brand-glow": "#8F00FF",
} as const;

export const colors = {
  "page": "#FAF9FF",
  "band": "#F1EEFC",
  "surface": "#FFFFFF",
  "sunken": "#F4F2FD",
  "line": "#E4E0F5",
  "control": "#77719B",
  "ink": "#16122E",
  "muted": "#5A5675",
  "tertiary": "#635F80",
  "heading": "#5B21B6",
  "accent": "#7C3AED",
  "accent-strong": "#6D28D9",
  "accent-soft": "#EDE9FE",
  "primary": "#3F5FE0",
  "primary-hover": "#2F4CC4",
  "on-primary": "#FFFFFF",
  "primary-text": "#3F5FE0",
  "data-mark": "#3F5FE0",
  "hero-bg": "#1E1250",
  "on-hero": "#FFFFFF",
  "on-hero-muted": "#C4B5FD",
  "status-much": "#BE123C",
  "status-much-soft": "#FFE4E8",
  "status-higher": "#A35207",
  "status-higher-soft": "#FEF1DC",
  "status-usual": "#5A5675",
  "status-usual-soft": "#EEECF5",
  "status-lower": "#0B7A6E",
  "status-lower-soft": "#DDF4F0",
  "danger": "#B42318",
  "danger-soft": "#FDECEA",
  "pop": "#8F00FF",
  "pop-soft": "#F3E8FF",
  "sun": "#7C93F5",
  "cat-1": "#7C3AED",
  "cat-2": "#DB2777",
  "cat-3": "#18181B",
  "cat-4": "#0369A1",
  ...data,
} as const;

/** The dark theme's values for every token that differs from light (the data scales do not). */
export const darkColors = {
  ...colors,
  "page": "#0D0A22",
  "band": "#120E2C",
  "surface": "#171335",
  "sunken": "#100C27",
  "line": "#2C2755",
  "control": "#7F79B0",
  "ink": "#F1EFFF",
  "muted": "#A9A3CF",
  "tertiary": "#9C96C4",
  "heading": "#F1EFFF",
  "accent": "#C4B5FD",
  "accent-strong": "#DDD6FE",
  "accent-soft": "#2A2160",
  "primary-hover": "#3352D0",
  "primary-text": "#7C93F5",
  "data-mark": "#7C93F5",
  "status-much": "#FB7185",
  "status-much-soft": "#3A1520",
  "status-higher": "#F59E0B",
  "status-higher-soft": "#33250D",
  "status-usual": "#A9A3CF",
  "status-usual-soft": "#24203F",
  "status-lower": "#2DD4BF",
  "status-lower-soft": "#0F2E31",
  "danger": "#F97066",
  "danger-soft": "#3A1620",
  "pop-soft": "#2A1450",
  "cat-1": "#C4B5FD",
  "cat-2": "#F472B6",
  "cat-3": "#FFFFFF",
  "cat-4": "#71717A",
} as const;

export type ColorToken = keyof typeof colors;

/** Palette name -> the CSS variable in styles/tokens.css. */
export const TOKEN_VARS: Record<ColorToken, string> = {
  "page": "--bg-page",
  "band": "--bg-band",
  "surface": "--bg-surface",
  "sunken": "--bg-sunken",
  "line": "--border-subtle",
  "control": "--border-control",
  "ink": "--text-primary",
  "muted": "--text-secondary",
  "tertiary": "--text-tertiary",
  "heading": "--text-heading",
  "accent": "--accent",
  "accent-strong": "--accent-hover",
  "accent-soft": "--accent-soft",
  "primary": "--primary",
  "primary-hover": "--primary-hover",
  "on-primary": "--on-primary",
  "primary-text": "--primary-text",
  "data-mark": "--data-mark",
  "hero-bg": "--hero-bg",
  "on-hero": "--on-hero",
  "on-hero-muted": "--on-hero-muted",
  "status-much": "--status-much",
  "status-much-soft": "--status-much-fill",
  "status-higher": "--status-higher",
  "status-higher-soft": "--status-higher-fill",
  "status-usual": "--status-usual",
  "status-usual-soft": "--status-usual-fill",
  "status-lower": "--status-lower",
  "status-lower-soft": "--status-lower-fill",
  "danger": "--danger-notice",
  "danger-soft": "--danger-notice-fill",
  "pop": "--pop",
  "pop-soft": "--pop-soft",
  "sun": "--sun",
  "cat-1": "--cat-1",
  "cat-2": "--cat-2",
  "cat-3": "--cat-3",
  "cat-4": "--cat-4",
  "map-1": "--map-1",
  "map-2": "--map-2",
  "map-3": "--map-3",
  "map-4": "--map-4",
  "map-5": "--map-5",
  "map-none": "--map-none",
  "div-1": "--div-1",
  "div-2": "--div-2",
  "div-3": "--div-3",
  "div-4": "--div-4",
  "div-5": "--div-5",
  "div-6": "--div-6",
  "div-7": "--div-7",
  "on-data-dark": "--on-data-dark",
  "on-data-light": "--on-data-light",
  "brand-purple-950": "--purple-950",
  "brand-purple-700": "--purple-700",
  "brand-violet-500": "--violet-500",
  "brand-violet-300": "--violet-300",
  "brand-royal-600": "--royal-600",
  "brand-royal-400": "--royal-400",
  "brand-glow": "--glow-violet",
};

/** `var(--token)` strings: valid in SVG presentation attributes and Leaflet path options, and they follow the theme. */
export const cssColors = Object.fromEntries(
  Object.entries(TOKEN_VARS).map(([k, v]) => [k, `var(${v})`]),
) as Record<ColorToken, string>;

/** Map classes from low to high. "No data" is never one of these: it is map-none, hatched. */
export const mapScale = [colors["map-1"], colors["map-2"], colors["map-3"], colors["map-4"], colors["map-5"]] as const;

/** Compare mode's categories, in order; never status colours. */
export const categorical = ["cat-1", "cat-2", "cat-3", "cat-4"] as const;

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
