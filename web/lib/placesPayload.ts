/**
 * The place lists the finder searches in the browser, from the API's clinics, polyclinics and
 * hospitals. Only places with a map point are kept. Used by /places.json (app/places.json/route.ts).
 */
import type { Clinic, Hospital, Polyclinic } from "./api/types";
import type { GpPlace, HospitalPlace, Place, Places } from "./nearby";

const hasPoint = <T extends { latitude?: number | null; longitude?: number | null }>(p: T): p is T & { latitude: number; longitude: number } =>
  p.latitude != null && p.longitude != null;

export function buildPlaces(clinics: Clinic[], polyclinics: Polyclinic[], hospitals: Hospital[]): Places {
  const gps: GpPlace[] = clinics.filter(hasPoint).map((c) => ({ name: c.clinic_name ?? "Clinic", address: c.address,
    postal_code: c.postal_code, latitude: c.latitude, longitude: c.longitude, planning_area: c.planning_area, has_cdmp: c.has_cdmp }));
  const polys: Place[] = polyclinics.filter(hasPoint).map((p) => ({ name: p.polyclinic_name, address: p.address,
    postal_code: p.postal_code, latitude: p.latitude, longitude: p.longitude }));
  const eds: HospitalPlace[] = hospitals.filter(hasPoint).map((h) => ({ code: h.hospital_code, name: h.hospital_name, address: null,
    postal_code: h.postal_code ?? null, latitude: h.latitude, longitude: h.longitude, facility_type: h.facility_type as "ED" | "UCC" }));
  return { gps, polyclinics: polys, hospitals: eds };
}
