/** The status scale has one set of words (docs/language_rules.md, Rule 5): the bed wait is never "busy" or "busier". */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { expect, it } from "vitest";

const ROOT = path.join(__dirname, "..");
const SKIP = /(\.test\.tsx?|\.d\.ts|\.generated\.ts)$|lib[\\/]samples\.ts$/;   // samples.ts: demo text about daily attendances

function files(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((name) => {
    const rel = path.join(dir, name);
    if (statSync(path.join(ROOT, rel)).isDirectory()) return files(rel);
    return /\.tsx?$/.test(name) && !SKIP.test(rel) ? [rel] : [];
  });
}

it("no 'busy', 'busier', 'busiest' or 'quieter' in the site's code or copy", () => {
  const hits = ["app", "components", "lib"].flatMap(files).flatMap((f) => {
    const src = readFileSync(path.join(ROOT, f), "utf8").replace(/aria-busy/g, "");
    const m = src.match(/\b(busy|busier|busiest|quieter|quietest)\b/gi);
    return m ? [`${f}: ${[...new Set(m)].join(", ")}`] : [];
  });
  expect(hits).toEqual([]);
});
