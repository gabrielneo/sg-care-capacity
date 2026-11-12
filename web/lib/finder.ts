/**
 * The public finder's results: the nearest GP clinics and polyclinics in one list, by straight-line
 * distance from the searched point. Everything here runs in the browser on lists the site already
 * has (lib/nearby.ts); nothing the person typed is sent anywhere.
 *
 * Distances are straight lines, never routes: the site has no routing data, so no travel time is
 * shown, and the first card is "Nearest", never "fastest".
 */
import { km, type Place, type Places } from "./nearby";

export type PlaceType = "gp" | "polyclinic";
export type TypeFilter = "all" | PlaceType;

export const TYPE_FILTERS: readonly { id: TypeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "gp", label: "GP clinics" },
  { id: "polyclinic", label: "Polyclinics" },
];

/** What each kind of place is called on a card. Every GP clinic listed is on CHAS, so it says so. */
export const TYPE_LABEL: Record<PlaceType, string> = { gp: "GP clinic on CHAS", polyclinic: "Polyclinic" };

export const RESULT_LIMIT = 8;

export interface Result {
  key: string;
  type: PlaceType;
  name: string;
  address: string | null;
  postal_code: string | null;
  latitude: number;
  longitude: number;
  km: number;
}

/** Anything that isn't a known filter (missing, misspelt) is "All". */
export function parseType(value: string | null | undefined): TypeFilter {
  return TYPE_FILTERS.some((t) => t.id === value) ? (value as TypeFilter) : "all";
}

const toResult = (type: PlaceType, p: Place, from: { latitude: number; longitude: number }): Result => ({
  key: `${type}|${p.name}|${p.postal_code ?? ""}`, type, name: p.name, address: p.address, postal_code: p.postal_code,
  latitude: p.latitude, longitude: p.longitude, km: km(from, p) });

/**
 * The nearest places of the chosen kind, nearest first; equal distances by name, then kind, so the
 * order never depends on the order the lists arrived in. Distances are not rounded before sorting.
 */
export function nearestPlaces(from: { latitude: number; longitude: number }, places: Pick<Places, "gps" | "polyclinics">,
                              filter: TypeFilter = "all", limit = RESULT_LIMIT): Result[] {
  const all: Result[] = [
    ...(filter === "polyclinic" ? [] : places.gps.map((p) => toResult("gp", p, from))),
    ...(filter === "gp" ? [] : places.polyclinics.map((p) => toResult("polyclinic", p, from))),
  ];
  return all.sort((a, b) => a.km - b.km || a.name.localeCompare(b.name) || a.type.localeCompare(b.type)).slice(0, limit);
}

/**
 * A link to directions in an external map app. It carries the place's own coordinates only: not
 * what the person typed and not where they are, so their phone's map app supplies the start.
 */
export function directionsUrl(place: { latitude: number; longitude: number }): string {
  const lat = place.latitude.toFixed(6);
  const lon = place.longitude.toFixed(6);
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
}

/** What a screen reader hears when the results change (the page's polite live region). */
export function announcement(label: string, results: readonly Pick<Result, "km" | "name">[], filter: TypeFilter = "all"): string {
  const one = filter === "gp" ? "GP clinic" : filter === "polyclinic" ? "polyclinic" : "place";
  const kind = (n: number) => (n === 1 ? one : `${one}s`);
  if (!results.length) return `No ${kind(0)} found near ${label}.`;
  const first = results[0]!;
  const d = first.km < 0.05 ? "under 0.1 km" : first.km < 10 ? `${first.km.toFixed(1)} km` : `${Math.round(first.km)} km`;
  return `${results.length} ${kind(results.length)} near ${label}. Nearest: ${first.name}, ${d} in a straight line.`;
}
