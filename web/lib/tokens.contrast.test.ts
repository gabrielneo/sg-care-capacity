/**
 * WCAG contrast for every text token on every background token, in both themes (docs/design/redesign_brief.md).
 * Text: 4.5:1. Control borders, the focus ring and status symbols: 3:1. Decorative borders (--border-subtle) are exempt.
 */
import { describe, expect, it } from "vitest";

import { colors, contrast, darkColors } from "./palette";

type Set = Record<string, string>;
const THEMES: [string, Set][] = [["light", colors], ["dark", darkColors]];

const BACKGROUNDS = ["page", "band", "surface", "sunken"] as const;
const TEXTS = ["ink", "muted", "tertiary", "accent", "status-much", "status-higher", "status-usual", "status-lower", "danger"] as const;
const STATUS = ["much", "higher", "usual", "lower"] as const;

describe.each(THEMES)("%s theme", (_name, c) => {
  for (const fg of TEXTS) {
    it.each(BACKGROUNDS)(`text ${fg} on %s >= 4.5`, (bg) => {
      expect(contrast(c[fg]!, c[bg]!)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it.each(STATUS)("status %s text on its own badge fill >= 4.5", (s) => {
    expect(contrast(c[`status-${s}`]!, c[`status-${s}-soft`]!)).toBeGreaterThanOrEqual(4.5);
  });

  it("the 995 notice text on its fill >= 4.5", () => {
    expect(contrast(c.danger!, c["danger-soft"]!)).toBeGreaterThanOrEqual(4.5);
  });

  // text-tertiary is for metadata on page/band/surface/sunken only: in dark it is 4.38 on the accent fill, so
  // a selected control uses accent, ink or muted text.
  it("selected state: accent, ink and muted text on the accent fill >= 4.5", () => {
    for (const t of ["accent", "ink", "muted"]) expect(contrast(c[t]!, c["accent-soft"]!)).toBeGreaterThanOrEqual(4.5);
  });

  it("text on an accent button (surface on accent) >= 4.5", () => {
    // In light the accent is dark and the label is paper; in dark the accent is light and the label is the page colour.
    const label = _name === "light" ? c.surface! : c.page!;
    expect(contrast(label, c.accent!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(BACKGROUNDS)("control border on %s >= 3", (bg) => {
    expect(contrast(c.control!, c[bg]!)).toBeGreaterThanOrEqual(3);
  });

  it.each(BACKGROUNDS)("focus ring (accent) on %s >= 3", (bg) => {
    expect(contrast(c.accent!, c[bg]!)).toBeGreaterThanOrEqual(3);
  });

  it.each(STATUS)("status symbol %s against its fill and the surface >= 3", (s) => {
    expect(contrast(c[`status-${s}`]!, c[`status-${s}-soft`]!)).toBeGreaterThanOrEqual(3);
    expect(contrast(c[`status-${s}`]!, c.surface!)).toBeGreaterThanOrEqual(3);
  });
});

describe("data cells carry their own label colour, in both themes", () => {
  const dark = ["div-1", "div-7", "map-4", "map-5"] as const;
  const light = ["div-2", "div-3", "div-4", "div-5", "div-6", "map-1", "map-2", "map-3"] as const;
  it.each(dark)("on-data-light on %s >= 4.5", (k) => expect(contrast(colors["on-data-light"], colors[k])).toBeGreaterThanOrEqual(4.5));
  it.each(light)("on-data-dark on %s >= 4.5", (k) => expect(contrast(colors["on-data-dark"], colors[k])).toBeGreaterThanOrEqual(4.5));
});
