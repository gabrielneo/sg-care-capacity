/**
 * What the project page's tiles say, from the API's responses. Nothing here is a hand-written health
 * figure: the findings are the insight engine's headline findings, the share is /api/v1/population,
 * and the checks are the latest data-quality run.
 */
import type { Insight, PopulationYear, QualityReport } from "./api/types";
import { percentText, populationShare, type StoryInsight, storySteps } from "./story";

export interface ChecksSummary {
  passed: number;
  total: number;
  /** Error-level failures: these block a release. */
  blocking: number;
  runId: string;
  checkedAt: string;
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
  };
}

/** Up to three headline findings for the tiles, in rank order. */
export function findingTiles(insights: Insight[]): StoryInsight[] {
  return storySteps(insights, 3);
}

/** The latest 65+ share as the text the tile shows ("19.5%"), or null without a population year. */
export function shareText(years: PopulationYear[]): string | null {
  const s = populationShare(years);
  return s ? percentText(s.latest.share_65plus) : null;
}
