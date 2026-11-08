/**
 * "Find care near you": turn a postcode or area name into a point, then list the nearest places.
 *
 * Nothing leaves the site: the point comes from the clinic, polyclinic and hospital lists the site
 * already has, never from a geocoding service.
 * - A 6-digit postcode that one of those places has: that place's point ("exact").
 * - Any other 6-digit postcode: the middle of every listed place in its postal sector, the first two
 *   digits ("sector"). A sector is a few streets to a town wide, so distances are approximate.
 * - An area name (URA planning area, e.g. "Bedok"): the middle of the CHAS clinics in that area ("area").
 * Distances are straight lines, not travel routes.
 */
export interface Place {
  name: string;
  address: string | null;
  postal_code: string | null;
  latitude: number;
  longitude: number;
}

export interface GpPlace extends Place {
  planning_area: string | null;
  has_cdmp: boolean | null;
}

export interface HospitalPlace extends Place {
  code: string;
  facility_type: "ED" | "UCC";
}

export interface Places {
  gps: GpPlace[];
  polyclinics: Place[];
  hospitals: HospitalPlace[];
}

export type Basis = "exact" | "sector" | "area";

export type Located =
  | { ok: true; latitude: number; longitude: number; basis: Basis; label: string }
  | { ok: false; reason: "empty" | "short_postcode" | "unknown_postcode" | "unknown_area" };

export interface Nearby<P extends Place> {
  place: P;
  km: number;
}

export const NEAREST = { polyclinics: 3, gps: 5, hospitals: 2 } as const;

const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
const centre = (ps: Place[]) => ({ latitude: mean(ps.map((p) => p.latitude)), longitude: mean(ps.map((p) => p.longitude)) });
const normal = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** What a person typed, read as a postcode or an area name. */
export function locate(query: string, places: Places): Located {
  const q = query.trim();
  if (!q) return { ok: false, reason: "empty" };
  const all: Place[] = [...places.gps, ...places.polyclinics, ...places.hospitals];
  const digits = q.replace(/\s+/g, "");
  if (/^\d+$/.test(digits)) {
    if (digits.length !== 6) return { ok: false, reason: "short_postcode" };
    const exact = all.find((p) => p.postal_code === digits);
    if (exact) return { ok: true, ...centre([exact]), basis: "exact", label: digits };
    const sector = all.filter((p) => p.postal_code?.slice(0, 2) === digits.slice(0, 2));
    if (sector.length) return { ok: true, ...centre(sector), basis: "sector", label: digits };
    return { ok: false, reason: "unknown_postcode" };
  }
  const wanted = normal(q);
  const areas = [...new Set(places.gps.map((g) => g.planning_area).filter((a): a is string => !!a))];
  const area = areas.find((a) => normal(a) === wanted) ?? areas.find((a) => normal(a).startsWith(wanted))
    ?? (wanted.length >= 4 ? areas.find((a) => normal(a).includes(wanted)) : undefined);
  if (!area) return { ok: false, reason: "unknown_area" };
  return { ok: true, ...centre(places.gps.filter((g) => g.planning_area === area)), basis: "area", label: titleCase(area) };
}

/** "JURONG WEST" -> "Jurong West", for area names only (clinic names are shown as published). */
export function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_, pre: string, c: string) => pre + c.toUpperCase());
}

/** Great-circle distance in km (haversine, mean Earth radius). */
export function km(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
}

export function nearest<P extends Place>(from: { latitude: number; longitude: number }, places: P[], n: number): Nearby<P>[] {
  return places.map((place) => ({ place, km: km(from, place) }))
    .sort((a, b) => a.km - b.km || a.place.name.localeCompare(b.place.name))
    .slice(0, n);
}

/** "under 0.1 km", "0.4 km", "2.3 km", "12 km". */
export function kmText(d: number): string {
  if (d < 0.05) return "under 0.1 km";
  return d < 10 ? `${d.toFixed(1)} km` : `${Math.round(d)} km`;
}

export const NOT_FOUND: Record<Exclude<Located, { ok: true }>["reason"], string> = {
  empty: "Type a postcode or an area name to see clinics near you.",
  short_postcode: "Singapore postcodes have 6 digits. Check the number and try again.",
  unknown_postcode: "We couldn't place that postcode. Try a nearby postcode, or an area name such as Bedok.",
  unknown_area: "We couldn't find that area. Try a postcode, or an area name such as Tampines or Jurong West.",
};

export const BASIS_NOTE: Record<Basis, string> = {
  exact: "Distances from that postcode, in a straight line.",
  sector: "Distances from the middle of that postcode's district, in a straight line, so they are approximate.",
  area: "Distances from the middle of that area's clinics, in a straight line, so they are approximate.",
};
