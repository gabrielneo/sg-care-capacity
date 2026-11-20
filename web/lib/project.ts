/**
 * What the project page's tiles say, from the API's responses. Nothing here is a hand-written health
 * figure: the findings are the insight engine's headline findings, the share is /api/v1/population,
 * and the checks are the latest data-quality run.
 */
import type { Hospital, Insight, PopulationYear, QualityReport } from "./api/types";
import { percentText, populationShare, type StoryInsight, storySteps } from "./story";

export interface ChecksSummary {
  passed: number;
  total: number;
  /** Error-level failures: these block a release. */
  blocking: number;
  runId: string;
  checkedAt: string;
  /** What the rest of the total is: warning-level failures, error-level failures, and checks that didn't run. */
  warnings: number;
  issues: number;
  skipped: number;
}

/** The checks that didn't pass, in words ("5 warnings, 1 issue, 2 skipped"), so "79/87" isn't read as 8 failures. Empty parts are left out. */
export function checksBreakdown(c: ChecksSummary): string {
  const part = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : null);
  return [part(c.warnings, "warning", "warnings"), part(c.issues, "issue", "issues"), part(c.skipped, "skipped", "skipped")]
    .filter(Boolean).join(", ");
}

/** "79 of 79 checks passed" from the latest run. Skipped checks count in the total and not as passed. */
export function checksSummary(report: QualityReport): ChecksSummary | null {
  const total = report.results.length;
  if (!total) return null;
  return {
    passed: report.results.filter((r) => r.status === "pass").length,
    total,
    blocking: report.blocking,
    runId: report.run_id,
    checkedAt: report.checked_at,
    warnings: report.results.filter((r) => r.status === "fail" && r.severity !== "ERROR").length,
    issues: report.results.filter((r) => r.status === "fail" && r.severity === "ERROR").length,
    skipped: report.results.filter((r) => r.status === "skipped").length,
  };
}

/** Up to three headline findings for the tiles, in rank order. */
export function findingTiles(insights: Insight[], hospitals: readonly Pick<Hospital, "hospital_code" | "facility_type">[]): StoryInsight[] {
  return storySteps(insights, hospitals, 3);
}

/** The latest 65+ share as the text the tile shows ("19.5%"), or null without a population year. */
export function shareText(years: PopulationYear[]): string | null {
  const s = populationShare(years);
  return s ? percentText(s.latest.share_65plus) : null;
}
