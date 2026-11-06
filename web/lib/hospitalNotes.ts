import type { Hospital } from "./api/types";

/** A short label for a hospital whose figures aren't like-for-like with a full adult ED. */
export function shortNote(h: Pick<Hospital, "facility_type" | "coverage_note">): string | null {
  if (h.facility_type === "UCC") return "Urgent care centre";
  if (h.coverage_note && /^adult/i.test(h.coverage_note)) return "Adults only";
  return null;
}

/** "AH = urgent care centre; NUH = adults only" style lines, for chart descriptions. */
export function hospitalKey(hospitals: Hospital[]): string[] {
  return hospitals.flatMap((h) => {
    const note = shortNote(h);
    return note ? [`${h.hospital_code} = ${note.toLowerCase()}`] : [];
  });
}
