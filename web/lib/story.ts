/**
 * The Overview's scroll story, from /api/v1/insights and /api/v1/population. Every finding's text and
 * number comes from the insight engine (docs/insights_method.md); this module only picks, orders and
 * formats. It writes no finding text and computes no finding number.
 */
import type { Hospital, Insight, InsightChart, InsightDisplay, PopulationYear } from "./api/types";
import { BED_WAIT_LABEL } from "./copy";
import { systemFindings } from "./hospitals";

/** An insight the story can show: the engine wrote its labels and chart (releases before that didn't). */
export type StoryInsight = Insight & { display: InsightDisplay; chart: InsightChart };

export function isStoryInsight(i: Insight): i is StoryInsight {
  return i.display != null && i.chart != null;
}

/**
 * The headline findings, in rank order: the hero is the first, the scroll story shows up to three.
 * An urgent-care finding is never one, even in a release from before the engine scoped it (ADR 0012).
 */
export function storySteps(insights: Insight[], hospitals: readonly Pick<Hospital, "hospital_code" | "facility_type">[],
                           max = 3): StoryInsight[] {
  return systemFindings(insights, hospitals)
    .filter((i): i is StoryInsight => i.headline_rank != null && isStoryInsight(i))
    .sort((a, b) => (a.headline_rank as number) - (b.headline_rank as number))
    .slice(0, max);
}

/**
 * Why the story has nothing to show: no headline finding passed its check ("none"), or the data
 * release predates the labels and charts the story needs ("old_release").
 */
export function emptyReason(insights: Insight[]): "none" | "old_release" {
  return insights.some((i) => i.headline_rank != null && !isStoryInsight(i)) ? "old_release" : "none";
}

export const EMPTY_STORY = {
  none: "No finding passed its statistical check in this data release, so there is nothing to show here.",
  old_release: "This data release was published before the site could show its findings this way. They will appear from the next weekly release.",
} as const;

/** Which measure each detector's chart shows (docs/insights_method.md). */
const MEASURE: Record<Insight["type"], "bed_wait" | "clinics"> = {
  trend: "bed_wait",
  anomaly: "bed_wait",
  usual_gap: "bed_wait",
  weekday: "bed_wait",
  volume_vs_wait: "bed_wait",
  monthly_yoy: "bed_wait",
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
/**
 * How a finding's chart labels its values. One decimal for hours and gaps, two otherwise; and one more
 * (up to 3, bar charts only) while two different values would still print the same, so bars that differ never carry
 * identical labels (audit B5: visits vs waits had two bands both labelled −0.5).
 */
export function chartFormat(i: StoryInsight): (v: number) => string {
  const signed = i.chart.reference?.value === 0;
  const fmt = (digits: number) => (v: number) => {
    const text = Math.abs(v).toLocaleString("en-SG", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    if (!signed || Number(text) === 0) return text;
    return `${v > 0 ? "+" : "−"}${text}`;
  };
  const values = [...new Set(i.chart.points.map((p) => p.value).filter((v): v is number => v != null))];
  let digits = i.unit.startsWith("hours") || i.type === "volume_vs_wait" || i.type === "monthly_yoy" || i.type === "source_gap" ? 1 : 2;
  // Bars are compared with each other by their labels; a line's neighbouring weeks are read by their shape.
  while (i.chart.kind === "bar" && digits < 3 && new Set(values.map(fmt(digits))).size < values.length) digits += 1;
  return fmt(digits);
}

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
