import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SITE, SITE_TITLE } from "./site";

describe("one site name (audit G3)", () => {
  it("is \"Right-siting care\", with the tagline \"in a super-aged Singapore\"", () => {
    expect(SITE_TITLE).toBe("Right-siting care in a super-aged Singapore");
  });

  it("is never typed outside lib/site.ts", () => {
    const ROOT = path.resolve(import.meta.dirname, "..");
    const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) && !/\.test\.|samples\.ts|\.generated\.ts/.test(f) ? [p] : [];
    });
    const hits = ["app", "components", "lib"].flatMap((d) => files(path.join(ROOT, d)))
      .filter((f) => !f.endsWith(path.join("lib", "site.ts")))
      .filter((f) => readFileSync(f, "utf8").replace(/^\s*(\*|\/\/).*$/gm, "").includes(SITE.name)
        || /super-aged Singapore/.test(readFileSync(f, "utf8").replace(/^\s*(\*|\/\/).*$/gm, "")));
    expect(hits.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
});
