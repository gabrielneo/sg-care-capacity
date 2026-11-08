/**
 * The home page's key takeaways: the engine's headline findings in their shortest form. Every word
 * and number is the engine's own (chart callout, display numbers); this file only picks and joins
 * them. The full sentence, method and statistics stay on /findings and in the methods drawer.
 */
import type { Insight } from "./api/types";

export interface Takeaway {
  id: string;
  /** Hospital code (for a <Term>) or area name, as the engine names it. */
  entity: string;
  isHospital: boolean;
  /** The engine's chart callout, e.g. "Tuesdays: 43% above average". */
  title: string;
  /** "12.7 hours · vs 8.9 hours, its weekly average" (no number if the title has it), or null without a comparison. */
  numbers: string | null;
  headline: string;
}

export const MAX_TAKEAWAYS = 3;

export function takeaways(insights: Insight[], hospitalCodes: string[]): Takeaway[] {
  return [...insights]
    .filter((i) => i.headline_rank != null && i.chart?.callout)
    .sort((a, b) => (a.headline_rank as number) - (b.headline_rank as number))
    .slice(0, MAX_TAKEAWAYS)
    .map((i) => {
      const d = i.display;
      const value = d?.value_text && d.unit_text ? `${d.value_text} ${d.unit_text}` : null;
      const title = i.chart?.callout as string;
      // Don't repeat the number when the callout already states it ("19–25 Oct 2026: 2.1 hours").
      const lead = value && !title.includes(value) ? `${value} · ` : "";
      return {
        id: i.insight_id,
        entity: i.entity,
        isHospital: hospitalCodes.includes(i.entity),
        title,
        numbers: value && d?.comparison_label ? `${lead}vs ${d.comparison_label}` : null,
        headline: i.headline,
      };
    });
}
