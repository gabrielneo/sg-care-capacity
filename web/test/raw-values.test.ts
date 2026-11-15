import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Components take every colour, size, space, radius and shadow from the design tokens (styles/tokens.css, the @theme block in
 * app/globals.css). A raw hex colour or an arbitrary Tailwind value (text-[13px], bg-[#fff]) in app/ or components/ fails here,
 * and in ESLint (eslint.config.mjs), which uses the same patterns. Grid track lists (grid-cols-[1fr_auto]) are layout, not design values, and are allowed.
 */
export const HEX = /#[0-9a-fA-F]{3,8}\b/;
export const ARBITRARY = /(?:^|[\s"'`:])-?(?:text|bg|border|w|h|size|min-w|min-h|max-w|max-h|p[xytrbl]?|m[xytrbl]?|gap(?:-[xy])?|space-[xy]|top|left|right|bottom|inset|rounded|shadow|leading|tracking|fill|stroke|from|to|via|ring|outline|basis)-\[/;

const root = path.join(__dirname, "..");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    if (statSync(f).isDirectory()) return files(f);
    return /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f) ? [f] : [];
  });
}

describe("no raw values in components", () => {
  const sources = [...files(path.join(root, "app")), ...files(path.join(root, "components"))];
  it("scans the components", () => expect(sources.length).toBeGreaterThan(20));
  it.each(sources.map((f) => [path.relative(root, f), f]))("%s has no raw hex or arbitrary Tailwind value", (_name, f) => {
    const hits = readFileSync(f, "utf8").split("\n").flatMap((line, i) => (HEX.test(line) || ARBITRARY.test(line) ? [`${i + 1}: ${line.trim()}`] : []));
    expect(hits).toEqual([]);
  });
  it("catches the cases it is meant to", () => {
    for (const bad of ["text-[13px]", 'className="bg-[#fff]"', "w-[96px]"]) expect(HEX.test(bad) || ARBITRARY.test(bad)).toBe(true);
    for (const ok of ["text-meta", "has-[a:focus-visible]:outline-3", "w-spark"]) expect(HEX.test(ok) || ARBITRARY.test(ok)).toBe(false);
  });
});
