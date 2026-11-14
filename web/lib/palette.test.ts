import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { colors, contrast, cssColors, darkColors, divergingScale, mapScale, TOKEN_VARS } from "./palette";

const css = readFileSync(path.join(__dirname, "../styles/tokens.css"), "utf8");

/** The `--name: #hex` declarations inside the first block that starts at `marker`. */
function block(marker: string): Record<string, string> {
  const at = css.indexOf(marker);
  const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
  return Object.fromEntries([...body.matchAll(/(--[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)].map((m) => [m[1]!, m[2]!.toUpperCase()]));
}
const expected = (set: Record<string, string>) =>
  Object.fromEntries(Object.entries(TOKEN_VARS).map(([k, v]) => [v, set[k]!.toUpperCase()]));

describe("palette", () => {
  it("computes WCAG contrast correctly", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrast("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrast("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2);           // the classic AA grey
  });

  it("matches the light tokens in styles/tokens.css exactly", () => {
    expect(block(":root,\n[data-theme=\"light\"] {")).toEqual(expected(colors));
  });

  it("matches the dark tokens in styles/tokens.css exactly (the OS block and the manual block)", () => {
    const dark = expected(darkColors);
    const differing = Object.fromEntries(Object.entries(dark).filter(([k, v]) => expected(colors)[k] !== v));
    expect(block(':root:not([data-theme="light"])')).toMatchObject(differing);
    expect(block(':root[data-theme="dark"],\n[data-theme="dark"] {')).toMatchObject(differing);
    expect(block(':root:not([data-theme="light"])')).toEqual(block(':root[data-theme="dark"],\n[data-theme="dark"] {'));
  });

  it("the data scales are identical in both themes", () => {
    for (const k of Object.keys(TOKEN_VARS).filter((k) => /^(map|div|on-data)/.test(k))) {
      expect(darkColors[k as keyof typeof darkColors]).toBe(colors[k as keyof typeof colors]);
    }
  });

  it("cssColors are var() references to real tokens", () => {
    expect(cssColors.ink).toBe("var(--text-primary)");
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
