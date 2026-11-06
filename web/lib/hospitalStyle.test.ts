import { describe, expect, it } from "vitest";

import { SERIES_COLORS, SERIES_DASHES, seriesStyles } from "./hospitalStyle";
import { colors, contrast } from "./palette";

describe("hospital line styles", () => {
  it.each(SERIES_COLORS)("%s has at least 3:1 contrast against the card", (c) => {
    expect(contrast(c, colors.surface)).toBeGreaterThanOrEqual(3);
  });

  it("gives every one of the 9 hospitals a distinct colour and dash pair", () => {
    const pairs = SERIES_COLORS.map((c, i) => `${c}|${SERIES_DASHES[i]}`);
    expect(new Set(SERIES_COLORS).size).toBe(9);
    expect(new Set(pairs).size).toBe(9);
  });

  it("is stable by hospital, not by selection order", () => {
    const all = seriesStyles(["SGH", "AH", "CGH"]);
    expect(all.AH?.color).toBe(SERIES_COLORS[0]);
    expect(seriesStyles(["CGH", "SGH", "AH"]).SGH).toEqual(all.SGH);
  });
});
