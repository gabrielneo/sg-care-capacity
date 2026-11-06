/**
 * How fresh meta.as_of is, judged against how often its source publishes. One threshold for all
 * sources would be wrong: MOH publishes weekly, SingStat once a year, and the CHAS clinic list
 * was last updated in June 2024 (so it shows as old, which is true).
 */
import type { Meta } from "./api/types";
import { parseAsOf } from "./dates";

export type Cadence = "weekly" | "annual" | "irregular" | "live";
export type Level = "green" | "amber" | "red" | "unknown";

interface Span {
  days?: number;
  months?: number;
}

export const THRESHOLDS: Record<Cadence, { green: Span; amber: Span; describe: string }> = {
  weekly: { green: { days: 10 }, amber: { days: 21 }, describe: "published weekly: up to date within 10 days" },
  annual: { green: { months: 15 }, amber: { months: 18 }, describe: "published yearly: up to date within 15 months" },
  irregular: { green: { months: 12 }, amber: { months: 24 }, describe: "updated irregularly: up to date within 12 months" },
  live: { green: { days: 1 }, amber: { days: 7 }, describe: "a reading at one moment: up to date within a day" },
};

export const CADENCE_BY_SOURCE: Record<string, Cadence> = {
  moh_bed_waits: "weekly",
  moh_ed_attendances: "weekly",
  nuhs_live: "live",
  singstat_residents: "annual",
  datagov_annual_ae: "annual",
  datagov_chas: "irregular",
  datagov_planning_areas: "irregular",
  datagov_polyclinics: "irregular",
};

export const LABELS: Record<Level, string> = { green: "Up to date", amber: "Ageing", red: "Old", unknown: "Date unknown" };

/** The cadence of the source that meta.as_of comes from (the oldest input, for combined data). */
export function cadenceFor(meta: Pick<Meta, "as_of" | "sources">): Cadence {
  const source = meta.sources.find((s) => s.as_of === meta.as_of) ?? meta.sources[0];
  return (source && CADENCE_BY_SOURCE[source.id]) ?? "weekly";
}

function addSpan(d: Date, span: Span): Date {
  const out = new Date(d.getTime());
  if (span.months) out.setUTCMonth(out.getUTCMonth() + span.months);
  if (span.days) out.setUTCDate(out.getUTCDate() + span.days);
  return out;
}

export function humanAge(ms: number): string {
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return "under a day";
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 60) return `${Math.floor(days / 7)} weeks`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months} months`;
  return `${Math.floor(months / 12)} years`;
}

export interface Freshness {
  level: Level;
  label: string;
  age: string | null;
  cadence: Cadence;
}

export function freshness(asOf: string, cadence: Cadence, now: Date = new Date()): Freshness {
  const d = parseAsOf(asOf);
  if (!d) return { level: "unknown", label: LABELS.unknown, age: null, cadence };
  const t = THRESHOLDS[cadence];
  const level: Level = now <= addSpan(d, t.green) ? "green" : now <= addSpan(d, t.amber) ? "amber" : "red";
  return { level, label: LABELS[level], age: humanAge(Math.max(0, now.getTime() - d.getTime())), cadence };
}
