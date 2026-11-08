import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { colors, contrast, divergingScale, mapScale, TEXT_PAIRS, UI_PAIRS } from "./palette";

describe("palette", () => {
  it("computes WCAG contrast correctly", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrast("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrast("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2);           // the classic AA grey
  });

  it.each(TEXT_PAIRS)("text %s on %s meets AA (%s:1)", (fg, bg, min) => {
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(min);
  });

  it.each(UI_PAIRS)("UI %s against %s meets %s:1", (fg, bg, min) => {
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(min);
  });

  it("matches the @theme tokens in globals.css exactly", () => {
    const css = readFileSync(path.join(__dirname, "../app/globals.css"), "utf8");
    const theme = css.slice(css.indexOf("@theme"), css.indexOf("}", css.indexOf("@theme")));
    const tokens = Object.fromEntries(
      [...theme.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6});/g)].map((m) => [m[1], m[2]!.toUpperCase()]),
    );
    expect(tokens).toEqual(Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, v.toUpperCase()])));
  });

  it("map scale runs light to dark and 'no data' is not one of its classes", () => {
    const lightness = mapScale.map((c) => contrast(c, "#000000"));
    expect([...lightness].sort((a, b) => b - a)).toEqual(lightness);
    expect(mapScale).not.toContain(colors["map-none"]);
  });

  it("diverging scale: lightest at the centre (0), darkening evenly both ways", () => {
    const light = divergingScale.map((c) => contrast(c, "#000000"));
    const centre = light.indexOf(Math.max(...light));
    expect(centre).toBe(3);
    expect(light.slice(0, 4)).toEqual([...light.slice(0, 4)].sort((a, b) => a - b));     // darkest below 0 first
    expect(light.slice(3)).toEqual([...light.slice(3)].sort((a, b) => b - a));
  });
});
