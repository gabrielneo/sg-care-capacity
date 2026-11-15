import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Motion rules (UX audit D9). Data is never hidden behind a reveal. The only motion is a 120 ms colour change on hover and focus,
 * a 200 ms drawer or sheet slide, and a 180 ms accordion height, all from tokens and all off under prefers-reduced-motion.
 */
const root = path.join(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const css = read("app/globals.css");
const tokens = read("styles/tokens.css");

function tsx(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((n) => {
    const rel = path.join(dir, n);
    if (statSync(path.join(root, rel)).isDirectory()) return tsx(rel);
    return /\.tsx$/.test(n) && !/\.test\.tsx$/.test(n) ? [rel] : [];
  });
}

describe("motion", () => {
  it("only three keyframes exist: the drawer, the sheet and the delayed loading placeholder", () => {
    expect([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]).sort()).toEqual(["care-drawer-in", "care-sheet-in", "show-after-delay"]);
  });

  it("every transition and animation duration is a motion token", () => {
    const bad = [...css.matchAll(/(?<![-\w])(?:transition|animation)(?:-duration)?\s*:\s*([^;}]+)/g)]
      .map((m) => m[1]!.trim())
      .filter((v) => v !== "none" && !/var\(--dur-(hover|accordion|drawer)\)/.test(v) && !/^show-after-delay 0s linear 1s forwards$/.test(v) && !/^none !important$/.test(v));
    expect(bad).toEqual([]);
  });

  it("the three durations are 120, 180 and 200 ms", () => {
    expect(tokens).toMatch(/--dur-hover:\s*120ms/);
    expect(tokens).toMatch(/--dur-accordion:\s*180ms/);
    expect(tokens).toMatch(/--dur-drawer:\s*200ms/);
  });

  it("prefers-reduced-motion switches every animation and transition off", () => {
    const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?animation: none !important;[\s\S]*?transition: none !important;/);
    expect(block).not.toBeNull();
  });

  it("the drawer and accordion motion only runs with no-preference", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.care-drawer\[open\]/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*@supports[\s\S]*?::details-content/);
  });

  it("no component hides content until it scrolls into view", () => {
    const hits = tsx("components").concat(tsx("app")).flatMap((f) => {
      const src = readFileSync(path.join(root, f), "utf8");
      const out: string[] = [];
      if (/\b(?:opacity-0|invisible)\b/.test(src.replace(/sr-only/g, ""))) out.push("opacity-0/invisible");
      if (/\b(?:animate-(?!pulse)|transition-|duration-\d|delay-\d)/.test(src)) out.push("Tailwind animation or transition class");
      return out.length ? [`${f}: ${out.join(", ")}`] : [];
    });
    expect(hits).toEqual([]);
  });

  it("IntersectionObserver is only used for page chrome and the lazy map, never for data", () => {
    const used = tsx("components").concat(tsx("app")).filter((f) => /IntersectionObserver/.test(readFileSync(path.join(root, f), "utf8")))
      .map((f) => f.replace(/\\/g, "/")).sort();
    expect(used).toEqual(["components/OnThisPage.tsx", "components/SiteStrip.tsx", "components/home/CareMap.tsx"]);
  });
});

describe("fonts", () => {
  it("ships no web font, so a font swap can never shift the layout (the stacks name Inter and Source Serif 4 for readers who have them)", () => {
    expect(css).not.toMatch(/@font-face/);
    const layout = readFileSync(path.join(root, "app/layout.tsx"), "utf8");
    expect(layout).not.toMatch(/next\/font|rel="preload"/);
  });
});

describe("print theme", () => {
  const lightBlock = tokens.match(/:root,\n\[data-theme="light"\] \{\n([\s\S]*?)\n\}/)![1]!;
  const printBlock = tokens.match(/@media print \{\s*:root,\s*:root\[data-theme="dark"\],\s*\[data-theme="dark"\] \{\n([\s\S]*?)\n  \}\n\}/)![1]!;
  const norm = (b: string) => b.split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
  it("forces the light token values, whatever theme is set", () => expect(norm(printBlock)).toBe(norm(lightBlock)));
  it("the print rules hide the chrome and keep cards whole", () => {
    const print = css.slice(css.indexOf("@page"));
    for (const must of ["body > header", "body > footer", ".site-strip", '[data-testid="view-switch"]', "break-inside: avoid"]) expect(print).toContain(must);
  });
});
