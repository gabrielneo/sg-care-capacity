import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * One accent, colour only where it means something (17 Nov 2026 polish): no gradient text, no gradient buttons or bars, and the
 * landing page's figures and hero line in ink and the accent, not the decorative coral. The hero's soft glow (.hero-glow) is the one
 * radial gradient left on the page; a chart's own fill fading to nothing is allowed.
 */
const root = path.join(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("calm colour", () => {
  const css = read("app/globals.css");

  it("has no gradient text and no gradient on a button or bar", () => {
    expect(css).not.toMatch(/background-clip:\s*text/);
    expect(css).not.toMatch(/\.text-gradient|\.cta-primary/);
    expect(css).not.toMatch(/linear-gradient\([^)]*var\(--pop\)/);
  });

  it("the only radial gradients are the hero's two glows", () => {
    expect(css.match(/radial-gradient\(/g)).toHaveLength(2);
    expect(css.slice(css.indexOf(".hero-glow::before"), css.indexOf(".hero-glow::after") + 400)).toMatch(/radial-gradient/);
  });

  it("the landing page and its hero line use the accent and ink, never the coral or sun", () => {
    for (const f of ["app/page.tsx", "components/motion/HeroLine.tsx", "components/landing/LandingMap.tsx"]) {
      const src = read(f);
      expect(src, f).not.toMatch(/var\(--(?:pop|sun)\)|\b(?:text|bg|fill|stroke)-(?:pop|sun)\b|text-gradient/);
    }
  });

  it("buttons share one style: a solid primary and an outlined secondary", () => {
    expect(css).toMatch(/\.btn-primary \{ background: var\(--accent\);/);
    expect(css).toMatch(/\.btn-secondary \{ background: var\(--bg-surface\); border-color: var\(--border-control\);/);
  });
});
