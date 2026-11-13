/**
 * Which hospitals can be compared with each other (docs/adr/0012-urgent-care-centre-out-of-aggregates.md).
 *
 * Alexandra Hospital runs an urgent care centre (dim_hospital.facility_type = "UCC"), not a full
 * emergency department. It is shown in its own group and left out of every rank, count, median and
 * "largest change" across hospitals. Every such figure on the site starts from rankableHospitals()
 * (or splitByCare / systemFindings, which apply the same rule); nothing tests the code "AH".
 */
import type { Hospital, Insight } from "./api/types";

type Typed = Pick<Hospital, "hospital_code" | "facility_type">;

/** The group's heading and its one-line caveat, the same wherever the group appears. */
export const URGENT_CARE_HEADING = "Urgent care centre";
export const URGENT_CARE_NOTE = "Not compared with full emergency departments";

export const isUrgentCare = (h: Pick<Hospital, "facility_type">): boolean => h.facility_type === "UCC";

/** The full EDs: the hospitals every rank, count and median across hospitals is computed over. */
export function rankableHospitals<T extends Typed>(hospitals: readonly T[]): T[] {
  return hospitals.filter((h) => !isUrgentCare(h));
}

export function urgentCareHospitals<T extends Typed>(hospitals: readonly T[]): T[] {
  return hospitals.filter(isUrgentCare);
}

export const rankableCodes = (hospitals: readonly Typed[]): string[] => rankableHospitals(hospitals).map((h) => h.hospital_code);
export const urgentCareCodes = (hospitals: readonly Typed[]): string[] => urgentCareHospitals(hospitals).map((h) => h.hospital_code);

/**
 * Items keyed by hospital code, split into the comparable group and the urgent care group, each in
 * the order given. A code that isn't in `hospitals` is treated as comparable (it can't be shown as UCC
 * without the reference saying so).
 */
export function splitByCare<T>(items: readonly T[], code: (item: T) => string, hospitals: readonly Typed[]):
  { rankable: T[]; urgentCare: T[] } {
  const ucc = new Set(urgentCareCodes(hospitals));
  return { rankable: items.filter((i) => !ucc.has(code(i))), urgentCare: items.filter((i) => ucc.has(code(i))) };
}

/** A finding about the urgent care centre: the engine's scope, or (for a release from before scope) its entity. */
export function isUrgentCareFinding(i: Pick<Insight, "entity"> & { scope?: Insight["scope"] }, hospitals: readonly Typed[]): boolean {
  if (i.scope) return i.scope === "urgent_care";
  return urgentCareCodes(hospitals).includes(i.entity);
}

/** The findings that can be ranked and shown as system-wide takeaways. */
export function systemFindings<T extends Pick<Insight, "entity"> & { scope?: Insight["scope"] }>(
  insights: readonly T[], hospitals: readonly Typed[]): T[] {
  return insights.filter((i) => !isUrgentCareFinding(i, hospitals));
}

export function urgentCareFindings<T extends Pick<Insight, "entity"> & { scope?: Insight["scope"] }>(
  insights: readonly T[], hospitals: readonly Typed[]): T[] {
  return insights.filter((i) => isUrgentCareFinding(i, hospitals));
}
