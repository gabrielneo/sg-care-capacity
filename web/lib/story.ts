/**
 * The Overview's scroll story, from /api/v1/insights and /api/v1/population. Every finding's text and
 * number comes from the insight engine (docs/insights_method.md); this module only picks, orders and
 * formats. It writes no finding text and computes no finding number.
 */
import type { Insight, InsightChart, InsightDisplay, PopulationYear } from "./api/types";
import { BED_WAIT_LABEL } from "./copy";

/** An insight the story can show: the engine wrote its labels and chart (releases before that didn't). */
export type StoryInsight = Insight & { display: InsightDisplay; chart: InsightChart };

export function isStoryInsight(i: Insight): i is StoryInsight {
  return i.display != null && i.chart != null;
}

/** The headline findings, in rank order: the hero is the first, the scroll story shows up to three. */
export function storySteps(insights: Insight[], max = 3): StoryInsight[] {
  return insights
    .filter((i): i is StoryInsight => i.headline_rank != null && isStoryInsight(i))
    .sort((a, b) => (a.headline_rank as number) - (b.headline_rank as number))
    .slice(0, max);
}

/** Which measure each detector's chart shows (docs/insights_method.md). */
const MEASURE: Record<Insight["type"], "bed_wait" | "clinics"> = {
  trend: "bed_wait",
  anomaly: "bed_wait",
  weekday: "bed_wait",
  volume_vs_wait: "bed_wait",
  source_gap: "bed_wait",
  regional: "bed_wait",
  access_gap: "clinics",
};

/** The chart's title. Rule 4: the bed-wait metric always carries its full label. */
export function chartTitle(i: StoryInsight): string {
  return MEASURE[i.type] === "bed_wait" ? BED_WAIT_LABEL : i.chart.y_label;
}

/**
 * How the chart's direct labels are written. Hours to one decimal (as in the sentences), rates and
 * ratios to two. Values around a zero reference line (e.g. "vs usual for that weekday") get a sign.
 */
export function chartFormat(i: StoryInsight): (v: number) => string {
  const digits = i.unit.startsWith("hours") || i.type === "volume_vs_wait" || i.type === "source_gap" ? 1 : 2;
  const signed = i.chart.reference?.value === 0;
  return (v: number) => {
    const text = Math.abs(v).toLocaleString("en-SG", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    if (!signed || Number(text) === 0) return text;
    return `${v > 0 ? "+" : "−"}${text}`;
  };
}

/** The suggested action, only once the author has reviewed it (docs/insight_actions.yml). */
export function whoActs(i: Insight): { who: string; action: string | null } | null {
  return i.who_acts ? { who: i.who_acts, action: i.action } : null;
}

export const ACTION_PENDING = "Not shown yet: the suggested action is waiting for the author's review.";

/** The finding's own caveat: the engine puts it first. */
export function primaryCaveat(i: Insight): string | null {
  return i.caveats[0] ?? null;
}

/** The latest year, and the earliest when there is more than one (one year: no trend is shown). */
export function populationShare(years: PopulationYear[]): { latest: PopulationYear; earliest: PopulationYear | null } | null {
  if (!years.length) return null;
  const sorted = [...years].sort((a, b) => a.year - b.year);
  const latest = sorted.at(-1) as PopulationYear;
  return { latest, earliest: sorted.length > 1 ? (sorted[0] as PopulationYear) : null };
}

/** 0.19527 -> "19.5%". */
export function percentText(share: number): string {
  return `${(share * 100).toLocaleString("en-SG", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** "2026-06-30" -> "June 2026". */
export function monthYear(iso: string): string {
  return new Intl.DateTimeFormat("en-SG", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${iso}T00:00:00Z`));
}

export const WORDS_PER_MINUTE = 200;

/** Reading time for prose, rounded up to whole minutes. */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
