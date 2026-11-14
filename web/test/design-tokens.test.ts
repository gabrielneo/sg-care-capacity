/**
 * Components use design tokens only (docs/design/redesign_brief.md): no raw colour values, no Tailwind
 * colour names that the theme doesn't define, no arbitrary colour or font-size classes such as text-[13px] or bg-[#fff].
 * Colours are written as hex in styles/tokens.css and lib/palette.ts only (a test keeps those two identical).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.join(__dirname, "..");
const SCAN = ["app", "components", "lib"];
const ALLOWED_FILES = new Set(["lib/palette.ts"]);          // the TypeScript copy of the tokens
const SKIP = /(\.test\.tsx?|\.d\.ts|\.generated\.ts)$|[\\/]api[\\/]schema/;

function files(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((name) => {
    const rel = path.join(dir, name);
    if (statSync(path.join(ROOT, rel)).isDirectory()) return files(rel);
    return /\.tsx?$/.test(name) && !SKIP.test(rel) ? [rel] : [];
  });
}

/** Source without comments, so a "#418" in a comment is not mistaken for a colour. */
function code(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const RULES: [string, RegExp][] = [
  ["raw hex colour", /#(?:[0-9A-Fa-f]{8}|[0-9A-Fa-f]{6})\b|(?<=["'`: (])#[0-9A-Fa-f]{3}(?=["'`;) ])/],
  ["rgb()/hsl() colour", /\b(?:rgba?|hsla?|oklch|oklab)\(/],
  ["arbitrary colour or font-size class", /\b(?:bg|text|fill|stroke|ring|outline|from|to|via|shadow|decoration|divide|caret|accent)-\[[^\]]+\]|\bborder-\[(?!\d)[^\]]+\]/],
  ["Tailwind colour name the theme does not define",
    /\b(?:bg|text|border|ring|fill|stroke|outline|from|to|via|decoration|divide)-(?:white|black|slate|gray|zinc|neutral|stone|red|green|emerald|teal|lime|amber|orange|yellow|blue|indigo|violet|purple|pink|rose|sky|cyan|fuchsia)(?:-\d{2,3})?\b/],
];

describe("design tokens only", () => {
  const sources = SCAN.flatMap(files).filter((f) => !ALLOWED_FILES.has(f.replace(/\\/g, "/")));

  it("finds the source files", () => expect(sources.length).toBeGreaterThan(100));

  it.each(RULES)("no %s in components", (_name, re) => {
    const hits = sources.flatMap((f) => {
      const m = code(f).match(new RegExp(re.source, "g"));
      return m ? [`${f}: ${[...new Set(m)].join(", ")}`] : [];
    });
    expect(hits).toEqual([]);
  });
});
