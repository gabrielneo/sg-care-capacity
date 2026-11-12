import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { QualityReport } from "./api/types";
import { BUILD_FACTS } from "./author";
import { checksSummary, shareText } from "./project";

const result = (status: "pass" | "fail" | "skipped") => ({
  blocks_publish: false, check_id: "c", details: null, failing_rows: 0, scope: "s", severity: "ERROR" as const, status, table: "t",
});
const report = (statuses: ("pass" | "fail" | "skipped")[], blocking = 0): QualityReport =>
  ({ blocking, checked_at: "2026-11-08T00:00:00Z", counts: {}, results: statuses.map(result), run_id: "run-1" }) as QualityReport;

describe("checksSummary", () => {
  it("counts passes out of every check that ran", () => {
    expect(checksSummary(report(["pass", "pass", "fail", "skipped"], 1))).toMatchObject({ passed: 2, total: 4, blocking: 1, runId: "run-1" });
  });
  it("says nothing when there are no results, rather than 0 of 0", () => {
    expect(checksSummary(report([]))).toBeNull();
  });
});

describe("shareText", () => {
  it("formats the latest year's share with one decimal", () => {
    const y = (year: number, share: number) => ({ year, share_65plus: share }) as never;
    expect(shareText([y(2025, 0.18), y(2026, 0.195)])).toBe("19.5%");
  });
  it("is null without a population year", () => expect(shareText([])).toBeNull());
});

describe("BUILD_FACTS", () => {
  it("still match the README", () => {
    const readme = readFileSync(path.resolve(import.meta.dirname, "../../README.md"), "utf8");
    expect(readme).toContain(`Over ${BUILD_FACTS.tests.replace("+", "")}`);
    expect(readme).toMatch(new RegExp(`${BUILD_FACTS.auditSampled} random`));
  });
});
