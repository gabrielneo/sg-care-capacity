import type { Hospital } from "@/lib/api/types";
import { formatAsOf } from "@/lib/dates";

/** Where the hospital pins on the map and the distances come from. Nothing when the release has no pins (audit L3). */
export function LocationSource({ hospitals }: { hospitals: Pick<Hospital, "latitude" | "location_checked">[] }) {
  const pinned = hospitals.filter((h) => h.latitude != null && h.location_checked);
  if (!pinned.length) return null;
  const checked = pinned.map((h) => h.location_checked as string).sort().at(-1) as string;
  return (
    <p className="mt-2 text-small text-muted" data-testid="location-source">
      Hospital locations: map pins from{" "}
      OneMap (Singapore Land Authority), checked {formatAsOf(checked)}.
    </p>
  );
}
