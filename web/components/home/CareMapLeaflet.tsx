"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";

import { MAX_BOUNDS, ONEMAP_ATTRIBUTION, ONEMAP_TILES } from "@/lib/onemap";
import { colors } from "@/lib/palette";
import type { Level } from "@/lib/status";

export interface MapPoint {
  name: string;
  latitude: number;
  longitude: number;
}
export interface MapHospital extends MapPoint {
  code: string;
  level: Level;
}
export interface CareMapProps {
  hospitals: MapHospital[];
  polyclinics: MapPoint[];
  gps: MapPoint[];
  here: (MapPoint & { label: string }) | null;
  /** After a search: the places the results list, so the map frames them all. */
  focus: MapPoint[];
}

export const LEVEL_FILL: Record<Level, string> = {
  much_higher: colors.bad,
  higher: colors.warn,
  usual: colors.ok,
  lower: colors.ok,
  unknown: colors.muted,
};

function Fit({ hospitals, here, focus }: Pick<CareMapProps, "hospitals" | "here" | "focus">) {
  const map = useMap();
  useEffect(() => {
    const pts: L.LatLngTuple[] = (here ? [here, ...focus] : hospitals).map((p) => [p.latitude, p.longitude]);
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [32, 32], maxZoom: here ? 15 : 12 });
  }, [map, hospitals, here, focus]);
  return null;
}

export default function CareMapLeaflet({ hospitals, polyclinics, gps, here, focus }: CareMapProps) {
  return (
    <MapContainer center={[1.3521, 103.8198]} zoom={11} minZoom={10} maxZoom={19} maxBounds={MAX_BOUNDS}
                  scrollWheelZoom={false} className="h-[380px] w-full rounded-xl sm:h-[460px]" attributionControl>
      <TileLayer url={ONEMAP_TILES} attribution={ONEMAP_ATTRIBUTION} detectRetina maxZoom={19} minZoom={11} />
      <Fit hospitals={hospitals} here={here} focus={focus} />
      {polyclinics.map((p) => (
        <CircleMarker key={p.name} center={[p.latitude, p.longitude]} radius={5}
                      pathOptions={{ color: colors.surface, weight: 1.5, fillColor: colors.accent, fillOpacity: 1 }}>
          <Tooltip>{p.name}</Tooltip>
        </CircleMarker>
      ))}
      {gps.map((g) => (
        <CircleMarker key={`${g.name}|${g.latitude}`} center={[g.latitude, g.longitude]} radius={4}
                      pathOptions={{ color: colors.accent, weight: 2, fillColor: colors.surface, fillOpacity: 1 }}>
          <Tooltip>{g.name}</Tooltip>
        </CircleMarker>
      ))}
      {hospitals.map((h) => (
        <CircleMarker key={h.code} center={[h.latitude, h.longitude]} radius={11}
                      pathOptions={{ color: colors.surface, weight: 2, fillColor: LEVEL_FILL[h.level], fillOpacity: 1 }}>
          <Tooltip permanent direction="right" offset={[10, 0]} className="!text-xs !font-semibold">{h.code}</Tooltip>
        </CircleMarker>
      ))}
      {here ? (
        <CircleMarker center={[here.latitude, here.longitude]} radius={8}
                      pathOptions={{ color: colors.ink, weight: 3, fillColor: colors.surface, fillOpacity: 1 }}>
          <Tooltip permanent direction="top" offset={[0, -8]}>{here.label}</Tooltip>
        </CircleMarker>
      ) : null}
    </MapContainer>
  );
}
