import { LEVELS, type Level } from "./status";

/**
 * Section ledes that state a fact from the data. Plain functions of the numbers, so the sentence can never say more than the data does:
 * no figures means no sentence (null), never a weaker one. Words follow docs/language_rules.md: the status scale's own words ("above usual"), no crowding words.
 */

const count = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** How the compared emergency departments split across the status scale. `counts` is from levelCounts. */
export function levelSplitLede(counts: Record<Level, number>): string | null {
  const compared = counts.much_higher + counts.higher + counts.usual + counts.lower;
  if (compared <= 0) return null;
  const parts = (["much_higher", "higher", "usual", "lower"] as const)
    .filter((l) => counts[l] > 0)
    .map((l) => `${counts[l]} ${LEVELS[l].label.toLowerCase()}`);
  return `Of ${compared} emergency ${count(compared, "department", "departments")} with a comparison: ${parts.join(", ")}.`;
}

/** What the data-quality checks found. `warnings` are failed warning-level checks; `blocking` failures stop publishing. */
export function checksLede(total: number, blocking: number, warnings: number): string | null {
  if (total <= 0) return null;
  if (blocking > 0) return `${blocking} of ${total} checks failed and block publishing.`;
  if (warnings === 0) return `All ${total} checks passed.`;
  return `${total} checks ran; none stops publishing and ${warnings} raised a warning.`;
}

/** How many sources are within their own publishing schedule. `levels` are datasetFreshness levels; "unknown" ones are not counted either way. */
export function freshnessLede(levels: string[]): string | null {
  const known = levels.filter((l) => l === "up_to_date" || l === "due" || l === "overdue");
  if (known.length === 0) return null;
  const late = known.filter((l) => l !== "up_to_date").length;
  if (late === 0) return known.length === 1 ? "The source is up to date." : `All ${known.length} sources are up to date.`;
  return `${late} of ${known.length} ${count(known.length, "source is", "sources are")} past ${count(late, "its", "their")} publishing schedule.`;
}
