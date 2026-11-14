import type { Hospital } from "@/lib/api/types";
import { formatAsOf } from "@/lib/dates";

/** Where the hospital pins on the map and the distances come from. Nothing when the release has no pins (audit L3). */
export function LocationSource({ hospitals }: { hospitals: Pick<Hospital, "latitude" | "location_checked" | "location_source_url">[] }) {
  const pinned = hospitals.filter((h) => h.latitude != null && h.location_checked);
  if (!pinned.length) return null;
  const checked = pinned.map((h) => h.location_checked as string).sort().at(-1) as string;
  const url = pinned.find((h) => h.location_source_url)?.location_source_url ?? null;
  return (
    <p className="mt-2 text-sm text-muted" data-testid="location-source">
      Hospital locations: map pins from{" "}
      {url ? <a href={url}>OneMap</a> : "OneMap"} (Singapore Land Authority), checked {formatAsOf(checked)}.
    </p>
  );
}
