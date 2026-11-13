import type { Hospital } from "./api/types";
import { isUrgentCare } from "./hospitals";

/** A short label for a hospital whose figures aren't like-for-like with a full adult ED. */
export function shortNote(h: Pick<Hospital, "facility_type" | "coverage_note">): string | null {
  if (isUrgentCare(h)) return "Urgent care centre";
  if (h.coverage_note && /^adult/i.test(h.coverage_note)) return "Adults only";
  return null;
}

/**
 * The caveat pinned on a hospital when values are compared across hospitals (raw mode): why its
 * figures aren't like for like. Null for a full adult and children's ED.
 */
export function pinnedCaveat(h: Pick<Hospital, "facility_type" | "coverage_note">): string | null {
  if (isUrgentCare(h)) return "Urgent Care Centre (UCC): not a full ED, so its waits are shorter";
  if (h.coverage_note && /^adult/i.test(h.coverage_note)) return "Adults only: MOH's figures leave out children's emergency";
  return null;
}
