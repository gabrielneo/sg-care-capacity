/**
 * How a hospital's days spread around its weekly figures (ED Trends): the daily medians MOH publishes, over the complete weeks of the
 * weekday window, as a box plot. The weekly figures average these days, and the average hides the long ones; this shows them.
 * Descriptive only: quantiles of published figures (type 7, as the all-hospital band), no test and no new measure.
 */
import type { EdDay } from "./api/types";
import { median, quantile } from "./edCompare";

export interface Spread {
  code: string;
  /** Days with a figure, in complete weeks of the window. */
  n: number;
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  /** The longest day, and its date. */
  max: number;
  maxDate: string;
  /** The average of the daily medians: what the weekly figures are made of. */
  mean: number;
}

/** A spread needs this many days to say anything about its tails. */
export const SPREAD_MIN_DAYS = 28;

/** Each hospital's spread over the days in [from, to] that sit in complete weeks; a hospital with too few days is left out. */
export function spreads(daily: EdDay[], codes: string[], from: string, to: string): Spread[] {
  return codes.flatMap((code) => {
    const days = daily.filter((d) => d.hospital_code === code && d.is_complete_week && d.median_wait_hours != null
                                     && d.report_date >= from && d.report_date <= to);
    if (days.length < SPREAD_MIN_DAYS) return [];
    const v = days.map((d) => d.median_wait_hours as number);
    const top = days.reduce((a, b) => ((b.median_wait_hours as number) > (a.median_wait_hours as number) ? b : a));
    return [{
      code, n: v.length, p10: quantile(v, 0.1) as number, p25: quantile(v, 0.25) as number, median: median(v) as number,
      p75: quantile(v, 0.75) as number, p90: quantile(v, 0.9) as number, max: top.median_wait_hours as number, maxDate: top.report_date,
      mean: v.reduce((s, x) => s + x, 0) / v.length,
    }];
  });
}

/** One sentence: how many hospitals' averages sit above their middle day, the long days pulling them up. */
export function skewSentence(rows: Spread[]): string | null {
  if (!rows.length) return null;
  const above = rows.filter((r) => r.mean > r.median).length;
  return `At ${above} of ${rows.length} ${rows.length === 1 ? "hospital" : "hospitals"}, the average of the daily figures is above the middle day: ` +
    "a few long days pull the average up, which is why the weekly figures can sit above a typical day.";
}
