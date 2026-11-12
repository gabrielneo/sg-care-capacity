/**
 * Which findings a section's callouts show. The text and every number come from the insight engine
 * (docs/insights_method.md); this only picks, orders and splits them.
 */
import type { Insight } from "./api/types";

/** Callouts shown before "More findings". */
export const MAX_CALLOUTS = 2;

export type Strength = NonNullable<Insight["strength"]>;
const RANK: Record<Strength, number> = { negligible: 0, weak: 1, moderate: 2, strong: 3 };

/** The symbol beside the word, so strength is never shown by colour alone. */
export const STRENGTH_SYMBOL: Record<Strength, string> = { negligible: "○", weak: "◔", moderate: "◑", strong: "●" };

/** Same order as the engine's own ranking: rank score, then size of effect, then id. */
function byStrength(a: Insight, b: Insight): number {
  return b.rank_score - a.rank_score || Math.abs(b.effect_size ?? 0) - Math.abs(a.effect_size ?? 0)
    || (RANK[b.strength ?? "negligible"] - RANK[a.strength ?? "negligible"]) || a.insight_id.localeCompare(b.insight_id);
}

export interface Selection {
  shown: Insight[];
  more: Insight[];
}

/**
 * Findings of these types about these hospitals, strongest first. One finding per hospital: two detectors can
 * describe the same week (a week far above usual is also an unusual week), and the stronger one is kept.
 * "All hospitals" findings are always in scope. A finding with no chart data (an older release) is left out.
 */
export function selectCallouts(insights: Insight[], types: Insight["type"][], codes: string[]): Selection {
  const inScope = insights
    .filter((i) => types.includes(i.type) && i.display && (i.entity === "All hospitals" || codes.includes(i.entity)))
    .sort(byStrength);
  const seen = new Set<string>();
  const unique = inScope.filter((i) => (seen.has(i.entity) ? false : (seen.add(i.entity), true)));
  return { shown: unique.slice(0, MAX_CALLOUTS), more: unique.slice(MAX_CALLOUTS) };
}

/** A finding says "associated with" rather than a cause; the page never adds a causal word to it. */
export const CAUSAL_WORDS = /\b(due to|caus(e|es|ed|ing)|driv(e|es|en|ing)|drove|leads? to|led to|because)\b/i;
