/**
 * How strong a finding's evidence is, in words, with its n and 95% interval (audit B1, B3). The level
 * is the engine's (fct_insight.evidence_level); for a release from before it was written, it is read
 * from the finding's p-value the same way the engine sets it.
 */
import type { Insight } from "./api/types";

export type EvidenceLevel = "observed" | "tested" | "robust" | "association-only";

export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  observed: "Observed, not tested",
  tested: "Tested",
  robust: "Tested, with a 95% range that excludes no difference",
  "association-only": "An association only (tested)",
};

/** Probability words: only a finding with a p-value may use them (the engine's own rule). */
export const PROBABILITY = /\b(chance|odds|(un)?likely|probab\w*|significan\w*|random\w*|by luck)\b/i;

type Stats = Pick<Insight, "type" | "p_adjusted" | "n" | "unit"> &
  Partial<Pick<Insight, "evidence_level" | "n_unit" | "ci_low" | "ci_high">>;

export function evidenceOf(i: Stats): EvidenceLevel {
  if (i.evidence_level) return i.evidence_level;
  if (i.p_adjusted == null) return "observed";
  return i.type === "volume_vs_wait" || i.type === "monthly_yoy" ? "association-only" : "tested";
}


/** "n = 182 days · 95% range 11.3–14.0 hours", or just the n when the method gives no interval. */
export function sampleText(i: Stats): string {
  const n = `n = ${i.n.toLocaleString("en-SG")}${i.n_unit ? ` ${i.n_unit}` : ""}`;
  if (i.ci_low == null || i.ci_high == null) return n;
  // Hours to one decimal, as everywhere on the site; rates and correlations to two.
  const hoursUnit = i.unit.startsWith("hours");
  const num = (v: number) => v.toFixed(hoursUnit ? 1 : 2);
  return `${n} · 95% range ${num(i.ci_low)} to ${num(i.ci_high)}${hoursUnit ? ` ${i.unit}` : ""}`;
}

/**
 * The detail as published, without any sentence that speaks of chance when the finding has no p-value.
 * The engine refuses such a sentence now; a release from before that rule (9 Nov 2026) still has one.
 */
export function safeDetail(i: Pick<Insight, "detail" | "p_adjusted">): string {
  if (i.p_adjusted != null) return i.detail;
  return i.detail.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter((s) => !PROBABILITY.test(s)).join(" ");
}
