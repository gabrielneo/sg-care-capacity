import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ChartCard is retired: every chart is a ChartFrame (components/ChartFrame.tsx), which always has a date and source in view,
 * a summary, a table and a CSV. Nothing may import it or bring the name back (ESLint's no-restricted-imports says the same).
 */
const root = path.join(__dirname, "..");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    if (n === "node_modules" || n === ".next") return [];
    if (statSync(f).isDirectory()) return files(f);
    return /\.(ts|tsx)$/.test(f) ? [f] : [];
  });
}

describe("ChartCard stays retired", () => {
  const sources = ["app", "components", "lib", "e2e", "test"].flatMap((d) => files(path.join(root, d))).filter((f) => !f.endsWith("no-chartcard.test.ts"));
  it("scans the code", () => expect(sources.length).toBeGreaterThan(100));
  it("the component file is gone", () => {
    expect(() => statSync(path.join(root, "components", "ChartCard.tsx"))).toThrow();
  });
  it("nothing imports or names ChartCard (or ChartCardSkeleton)", () => {
    const hits = sources.flatMap((f) => readFileSync(f, "utf8").split("\n").flatMap((line, i) =>
      (/\bChartCard\w*\b/.test(line) && !/Carried over from ChartCard/.test(line) ? [`${path.relative(root, f)}:${i + 1}: ${line.trim()}`] : [])));
    expect(hits).toEqual([]);
  });
});
