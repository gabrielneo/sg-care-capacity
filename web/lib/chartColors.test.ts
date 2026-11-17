/**
 * Chart colours (docs/design/redesign_brief.md): the compare-mode categories must stay apart for readers with
 * colour-vision deficiency, stay readable on every surface in both themes, and never reuse a status colour.
 * Simulation: Machado et al. 2009 matrices at full severity, in linear RGB; difference: CIE76 ΔE.
 */
import { describe, expect, it } from "vitest";

import { categorical, colors, contrast, darkColors, divergingScale, mapScale } from "./palette";
import { textOn } from "./edCompare";

const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const rgb = (h: string) => [0, 1, 2].map((i) => lin(parseInt(h.slice(1 + i * 2, 3 + i * 2), 16) / 255));
const MATRIX = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
} as const;
type Vision = "normal" | keyof typeof MATRIX;

function lab(h: string, v: Vision): number[] {
  const c = rgb(h);
  const [r, g, b] = v === "normal" ? c : MATRIX[v].map((m) => m[0]! * c[0]! + m[1]! * c[1]! + m[2]! * c[2]!);
  const t = (x: number) => (x > 0.008856 ? Math.cbrt(x) : 7.787 * x + 16 / 116);
  const fx = t((0.4124 * r! + 0.3576 * g! + 0.1805 * b!) / 0.95047);
  const fy = t(0.2126 * r! + 0.7152 * g! + 0.0722 * b!);
  const fz = t((0.0193 * r! + 0.1192 * g! + 0.9505 * b!) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export const deltaE = (a: string, b: string, v: Vision) => Math.hypot(...lab(a, v).map((x, i) => x - lab(b, v)[i]!));
const VISIONS: Vision[] = ["normal", "protanopia", "deuteranopia", "tritanopia"];
/** Below this two series are too alike to tell apart on a line chart. */
const MIN_DELTA_E = 15;

describe.each([["light", colors], ["dark", darkColors]] as const)("categorical palette, %s theme", (_n, c) => {
  const cats = categorical.map((k) => c[k]);
  it("has at most four categories", () => expect(categorical.length).toBeLessThanOrEqual(4));
  it.each(VISIONS)(`every pair differs by ΔE >= ${MIN_DELTA_E} for %s vision`, (v) => {
    for (let i = 0; i < cats.length; i++) for (let j = i + 1; j < cats.length; j++) {
      expect(deltaE(cats[i]!, cats[j]!, v), `${categorical[i]} vs ${categorical[j]}`).toBeGreaterThanOrEqual(MIN_DELTA_E);
    }
  });
  it.each(["surface", "page", "band", "sunken"] as const)("each category is a 3:1 graphic on %s", (bg) => {
    for (const k of cats) expect(contrast(k, c[bg])).toBeGreaterThanOrEqual(3);
  });
  it("no category is a status colour", () => {
    const status = (["much", "higher", "usual", "lower"] as const).flatMap((s) => [c[`status-${s}`], c[`status-${s}-soft`]]);
    for (const k of cats) expect(status).not.toContain(k);
  });
  it("the interface accent is category 1 only in light's ink blue, as the brief allows", () => {
    expect(cats[0]).toBe(c.accent);
  });
});

describe.each([["light", colors], ["dark", darkColors]] as const)("status never looks like the brand, %s theme", (_n, c) => {
  const brand = [c.accent, c.primary, c["data-mark"], c["brand-purple-700"]];
  it.each(VISIONS)("teal, amber and crimson stay apart from violet and royal blue for %s vision (ΔE >= 12)", (v) => {
    for (const s of [c["status-lower"], c["status-higher"], c["status-much"]]) for (const b of brand) {
      expect(deltaE(s, b, v), `${s} vs ${b}`).toBeGreaterThanOrEqual(12);
    }
  });
  it.each(VISIONS)("lower and higher, and higher and much higher, stay apart for %s vision", (v) => {
    expect(deltaE(c["status-lower"], c["status-higher"], v)).toBeGreaterThanOrEqual(MIN_DELTA_E);
    expect(deltaE(c["status-higher"], c["status-much"], v)).toBeGreaterThanOrEqual(MIN_DELTA_E);
  });
});

describe("the map ramp", () => {
  const L = mapScale.map((h) => lab(h, "normal")[0]!);
  it("runs light to dark in even steps of L* (one hue family, no cycling)", () => {
    const steps = L.slice(1).map((l, i) => L[i]! - l);
    for (const s of steps) expect(s).toBeGreaterThan(12);
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThanOrEqual(2);
  });
  it.each(VISIONS)("neighbouring classes stay apart for %s vision", (v) => {
    for (let i = 1; i < mapScale.length; i++) expect(deltaE(mapScale[i - 1]!, mapScale[i]!, v)).toBeGreaterThanOrEqual(10);
  });
});

describe("cell labels", () => {
  const bins = [...divergingScale, ...mapScale];
  it.each(bins.map((b) => [b]))("%s: the chosen label colour reaches 4.5:1", (bin) => {
    const label = textOn(bin) === "light" ? colors["on-data-light"] : colors["on-data-dark"];
    expect(contrast(label, bin)).toBeGreaterThanOrEqual(4.5);
  });
  it("the diverging ramp runs shorter to longer: teal, a neutral middle, amber", () => {
    expect(divergingScale).toHaveLength(7);
    const lum = divergingScale.map((h) => rgb(h).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0));
    expect(lum[3]).toBeGreaterThan(lum[0]!);
    expect(lum[3]).toBeGreaterThan(lum[6]!);
  });
});
