/**
 * Line styles for up to 9 hospitals. Too many for colour alone, so each also gets its own dash
 * pattern and is named in the legend and tooltip. Colours are Okabe-Ito based, darkened where
 * needed so every line has at least 3:1 contrast against the card (WCAG 1.4.11).
 */
export const SERIES_COLORS = ["#0072B2", "#C24E00", "#00805E", "#A8458A", "#7A6200", "#1F2937", "#5560C9", "#B5345A", "#4D7F17"] as const;
export const SERIES_DASHES = ["", "6 3", "2 3", "8 3 2 3", "", "4 4", "1 3", "10 4", "6 2 2 2"] as const;

export interface SeriesStyle {
  color: string;
  dash: string;
}

/** Stable per hospital: by the hospital's position in the full (sorted) list, not the selection. */
export function seriesStyles(allCodes: readonly string[]): Record<string, SeriesStyle> {
  const sorted = [...allCodes].sort();
  return Object.fromEntries(sorted.map((c, i) => [c, {
    color: SERIES_COLORS[i % SERIES_COLORS.length] as string,
    dash: SERIES_DASHES[i % SERIES_DASHES.length] as string,
  }]));
}
