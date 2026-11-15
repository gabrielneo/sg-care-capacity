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
// lib/palette.ts is the TypeScript copy of the tokens; the share-preview image is drawn by satori (pixels, not CSS), outside the page.
const ALLOWED_FILES = new Set(["lib/palette.ts", "app/opengraph-image.tsx"]);
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
  ["Tailwind font size outside the type scale (text-meta, -small, -body, -h3, -h2, -h1, -kpi)", /\btext-(?:xs|sm|base|lg|[2-9]?xl)\b/],
  ["font weight other than 400 and 600", /\bfont-(?:thin|extralight|light|medium|bold|extrabold|black)\b/],
  ["spacing off the 4/8 scale (use 1, 2, 3, 4, 6, 8, 12, 16 or 24)", /(?<![\w[-])-?(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-(?:0\.5|1\.5|2\.5|3\.5|5|7|9|10|11|14|20)(?![\w.\]])/],
  ["arbitrary spacing value", /(?<![\w[-])-?(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-\[/],
  ["arbitrary size value (use the spacing scale, or a named token such as header-h, h-map)", /(?<![\w[-])-?(?:h|w|min-h|min-w|max-h|max-w|size|top|bottom|left|right|inset|inset-x|inset-y|basis|rounded|leading|tracking)-\[/],
  ["font family outside the token stacks (app/globals.css)", /\bfont-?[Ff]amily:\s*["'`](?!system-ui|sans-serif)/],
  ["raw pixel or rem font size in an inline style", /\bfontSize:\s*[\d.]+\b(?!\s*\})/],
  ["SVG font size off the scale", /\bfontSize="(?!13"|14"|16")[^"]*"/],
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
