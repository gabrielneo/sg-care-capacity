"use client";

import { type ReactNode, useMemo } from "react";

import type { CareRow } from "@/lib/careMapState";
import { useFinder } from "@/lib/finderStore";
import { locate, NEAREST, nearest } from "@/lib/nearby";

import { CareMapPanel } from "./CareMapPanel";

type Point = { name: string; latitude: number; longitude: number };
const NONE: Point[] = []; // one array, so the map isn't asked to re-frame on every render

/** The map, with the search and the nearest clinics marked once there is a search. */
export function FinderMap({ rows, bodies, polyclinics, provenance }: {
  rows: CareRow[]; bodies: Record<string, ReactNode>; polyclinics: Point[]; provenance: ReactNode }) {
  const f = useFinder();
  const located = useMemo(() => (f.places && f.query.trim() ? locate(f.query, f.places) : null), [f.places, f.query]);
  const marks = useMemo(() => {
    if (!located?.ok || !f.places) return null;
    const pt = (n: { place: Point }): Point => ({ name: n.place.name, latitude: n.place.latitude, longitude: n.place.longitude });
    const gps = nearest(located, f.places.gps, NEAREST.gps).map(pt);
    const polys = nearest(located, f.places.polyclinics, NEAREST.polyclinics).map(pt);
    const eds = nearest(located, f.places.hospitals, 1).map(pt);
    return { gps, focus: [...gps, ...polys, ...eds] };
  }, [located, f.places]);
  return (
    <CareMapPanel rows={rows} bodies={bodies} provenance={provenance}
                  map={{ polyclinics, gps: marks?.gps ?? NONE, focus: marks?.focus ?? NONE,
                         here: located?.ok ? { name: located.label, label: located.label, latitude: located.latitude, longitude: located.longitude } : null }} />
  );
}
