import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { formatWindow, PROFILE_WEEKS, SPARK_WEEKS, USUAL_WEEKS } from "./windows";

describe("formatWindow", () => {
  it("says each window in words", () => {
    const week = { week_start: "2026-10-19", week_end: "2026-10-25" };
    expect(formatWindow({ kind: "latest_week", week })).toBe("latest complete week (19–25 Oct 2026)");
    expect(formatWindow({ kind: "latest_week" })).toBe("latest complete week");
    expect(formatWindow({ kind: "usual" })).toBe("vs usual (previous 8 complete weeks)");
    expect(formatWindow({ kind: "weeks", n: SPARK_WEEKS })).toBe("last 12 weeks");
    expect(formatWindow({ kind: "weeks", n: PROFILE_WEEKS })).toBe("last 26 weeks");
    expect(formatWindow({ kind: "days", from: "2026-08-03", to: "2026-10-31" })).toBe("3 Aug 2026 to 31 Oct 2026");
    expect(formatWindow({ kind: "weeks", n: 12 }, { capital: true })).toBe("Last 12 weeks");
    expect(USUAL_WEEKS).toBe(8);
  });

  it("never says \"last week\": the latest complete week is often weeks before today", () => {
    expect(formatWindow({ kind: "latest_week" })).not.toMatch(/last week/);
  });
});

describe("no window is typed by hand (A4)", () => {
  const ROOT = path.resolve(import.meta.dirname, "..");
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return /[\\/]app[\\/]dev$/.test(p) ? [] : files(p);
    return /\.(ts|tsx)$/.test(f) && !/\.test\.|samples\.ts|schema\.d\.ts|\.generated\.ts/.test(f) ? [p] : [];
  });
  const FREE = [/\blast week\b/i, /\blast \d+ weeks\b/i, /\b\d+-week\b/i, /\bprevious \d+ (complete )?weeks\b/i,
                /\b\d+ (complete )?weeks before\b/i, /\bof (its|the) \d+ (complete )?weeks\b/i];

  it("windows come from lib/windows.ts, never a literal like \"last week\" or \"8-week\"", () => {
    const hits: string[] = [];
    for (const f of ["app", "components", "lib"].flatMap((d) => files(path.join(ROOT, d)))) {
      if (f.endsWith(path.join("lib", "windows.ts"))) continue;
      // Comments may describe windows; only code and copy count.
      const code = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
      for (const re of FREE) {
        const m = code.match(re);
        if (m) hits.push(`${path.relative(ROOT, f)}: "${m[0]}"`);
      }
    }
    expect(hits).toEqual([]);
  });
});
