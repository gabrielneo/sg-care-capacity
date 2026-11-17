import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Motion rules. UX audit D9 allowed only a 120 ms colour change on hover and focus, a 200 ms drawer or sheet slide, and a 180 ms
 * accordion height. On 16 Nov 2026 the owner asked for a livelier landing page ("it feels dead"), so the landing page now also has:
 * a hero that builds itself on load, blocks that rise in as they scroll into view, figures that count up, the bed-wait dots sliding
 * to their values, and a scroll-progress bar. The safeguards below are what keeps that from becoming a place data can hide:
 * everything is under prefers-reduced-motion: no-preference, from duration tokens, only on the landing page, visible without JavaScript,
 * never hidden by the server, shown in print, and shown at the latest after a fail-safe.
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
  it("the keyframes are the drawer, the sheet, the loading placeholder and the landing page's own", () => {
    expect([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]).sort()).toEqual([
      "care-drawer-in", "care-sheet-in", "landing-cue", "landing-draw", "landing-fade", "landing-grow",
      "landing-progress", "landing-pulse", "landing-rise", "landing-slide", "show-after-delay"]);
  });

  it("every landing keyframe sits inside a prefers-reduced-motion: no-preference block", () => {
    const start = css.indexOf("@media (prefers-reduced-motion: no-preference) {\n  @keyframes landing-rise");
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf("\n}\n", start));
    for (const k of ["landing-rise", "landing-draw", "landing-fade", "landing-pulse", "landing-slide", "landing-grow", "landing-cue", "landing-progress"]) {
      expect(block).toContain(`@keyframes ${k}`);
    }
    expect(css.slice(0, start)).not.toMatch(/animation:\s*landing-/);          // nothing outside it starts a landing animation
  });

  it("every transition and animation duration is a motion token", () => {
    const bad = [...css.matchAll(/(?<![-\w])(?:transition|animation)(?:-duration)?\s*:\s*([^;}]+)/g)]
      .map((m) => m[1]!.trim())
      .filter((v) => v !== "none" && !/var\(--dur-(hover|accordion|drawer|reveal|draw)\)/.test(v) && v !== "landing-progress linear both" && !/^show-after-delay 0s linear 1s forwards$/.test(v) && !/^none !important$/.test(v));
    expect(bad).toEqual([]);
  });

  it("the interface durations are 120, 180 and 200 ms, and the landing page's are 700 ms and 1.6 s (the hero's background is still since 17 Nov 2026)", () => {
    expect(tokens).toMatch(/--dur-hover:\s*120ms/);
    expect(tokens).toMatch(/--dur-accordion:\s*180ms/);
    expect(tokens).toMatch(/--dur-drawer:\s*200ms/);
    expect(tokens).toMatch(/--dur-reveal:\s*700ms/);
    expect(tokens).toMatch(/--dur-draw:\s*1600ms/);
    expect(tokens).not.toMatch(/--dur-drift/);
  });

  it("only transform, opacity and the hero stroke are animated, so nothing shifts the layout", () => {
    const keyframes = [...css.matchAll(/@keyframes\s+landing-[\w-]+\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)].map((m) => m[1]!);
    const props = new Set(keyframes.flatMap((b) => [...b.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]!)));
    expect([...props].sort()).toEqual(["opacity", "stroke-dashoffset", "transform"]);
  });

  it("prefers-reduced-motion switches every animation and transition off", () => {
    const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?animation: none !important;[\s\S]*?transition: none !important;/);
    expect(block).not.toBeNull();
  });

  it("the drawer and accordion motion only runs with no-preference", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.care-drawer\[open\]/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*@supports[\s\S]*?::details-content/);
  });

  it("no component hides content with a utility class, and none uses Tailwind's animation or transition classes", () => {
    const hits = tsx("components").concat(tsx("app")).flatMap((f) => {
      const src = readFileSync(path.join(root, f), "utf8");
      const out: string[] = [];
      if (/\b(?:opacity-0|invisible)\b/.test(src.replace(/sr-only/g, ""))) out.push("opacity-0/invisible");
      if (/\b(?:animate-(?!pulse)|transition-|duration-\d|delay-\d)/.test(src)) out.push("Tailwind animation or transition class");
      return out.length ? [`${f}: ${out.join(", ")}`] : [];
    });
    expect(hits).toEqual([]);
  });

  it("a block is hidden only by [data-reveal=armed], only in no-preference, and only the browser sets that after load", () => {
    expect(css.match(/\[data-reveal="armed"\]\s*\{[^}]*opacity:\s*0/g)).toHaveLength(1);
    const noPref = css.indexOf("@media (prefers-reduced-motion: no-preference) {\n  @keyframes landing-rise");
    expect(css.indexOf('[data-reveal="armed"] { opacity: 0')).toBeGreaterThan(noPref);
    const armedBy = tsx("components").concat(tsx("app")).filter((f) => /dataset\.reveal\s*=\s*"armed"/.test(readFileSync(path.join(root, f), "utf8")))
      .map((f) => f.replace(/\\/g, "/"));
    expect(armedBy).toEqual(["components/motion/Reveal.tsx"]);
    const reveal = readFileSync(path.join(root, "components/motion/Reveal.tsx"), "utf8");
    expect(reveal).toMatch(/prefers-reduced-motion: reduce/);       // left alone with reduced motion
    expect(reveal).toMatch(/getBoundingClientRect\(\)\.top < window\.innerHeight/);   // never hides what is already on screen
    expect(reveal).toMatch(/FAILSAFE_MS = 6000/);
    expect(reveal).not.toMatch(/data-reveal="armed"/);                // the server never renders the hidden state
  });

  it("print shows every block, with no hidden state and no moving parts", () => {
    expect(css).toMatch(/@media print \{ \[data-reveal\] \{ opacity: 1 !important; transform: none !important; \}/);
  });

  it("only the landing page and the motion folder use the landing motion", () => {
    const users = tsx("components").concat(tsx("app")).filter((f) => /\b(Reveal|CountUp|HeroLine|ScrollProgress|landing-rise)\b/.test(readFileSync(path.join(root, f), "utf8")))
      .map((f) => f.replace(/\\/g, "/")).filter((f) => !f.startsWith("components/motion/")).sort();
    expect(users).toEqual(["app/page.tsx"]);
  });

  it("IntersectionObserver is only used for page chrome, the lazy map and the landing page's reveals and counters, never for data", () => {
    const used = tsx("components").concat(tsx("app")).filter((f) => /IntersectionObserver/.test(readFileSync(path.join(root, f), "utf8")))
      .map((f) => f.replace(/\\/g, "/")).sort();
    expect(used).toEqual(["components/OnThisPage.tsx", "components/SiteStrip.tsx", "components/home/CareMap.tsx", "components/motion/CountUp.tsx", "components/motion/Reveal.tsx"]);
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
