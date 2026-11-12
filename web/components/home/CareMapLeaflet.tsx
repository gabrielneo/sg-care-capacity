"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";

import { MAX_BOUNDS, ONEMAP_ATTRIBUTION, ONEMAP_TILES } from "@/lib/onemap";
import { colors } from "@/lib/palette";
import { type Level, LEVELS } from "@/lib/status";

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
  /** A hospital's marker was clicked, or Enter or Space was pressed on it. */
  onOpen?: (code: string) => void;
}

export const LEVEL_FILL: Record<Level, string> = {
  much_higher: colors.bad,
  higher: colors.warn,
  usual: colors.ok,
  lower: colors.ok,
  unknown: colors.muted,
};

/** Tab reaches the marker; Enter or Space opens the hospital's details, like a click. Re-runs harmlessly if the marker is re-added. */
function makeButton(marker: L.CircleMarker, h: MapHospital, onOpen?: (code: string) => void) {
  const el = marker.getElement() as SVGElement | undefined;
  if (!el) return;
  // An <svg> is an image to assistive technology, and an image's children can be flattened away: make it a group.
  const svg = el.ownerSVGElement;
  svg?.setAttribute("role", "group");
  svg?.setAttribute("aria-label", "Hospitals and clinics on the map");
  el.setAttribute("tabindex", "0");
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", `${h.name}: ${LEVELS[h.level].label}. Show details`);
  el.setAttribute("data-hospital-trigger", h.code);
  el.onkeydown = (ev: KeyboardEvent) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    ev.preventDefault();
    onOpen?.(h.code);
  };
}

/** Polyclinic and GP dots have no action and no keyboard route: out of the tab order and the accessibility tree (the places are listed on the page). */
function decorative(marker: L.CircleMarker) {
  const el = marker.getElement() as SVGElement | undefined;
  if (!el) return;
  el.setAttribute("tabindex", "-1");
  el.setAttribute("aria-hidden", "true");
  el.setAttribute("focusable", "false");
}

function Fit({ hospitals, here, focus }: Pick<CareMapProps, "hospitals" | "here" | "focus">) {
  const map = useMap();
  useEffect(() => {
    // The map box takes the arrow and +/- keys once focused: say so. The tooltips repeat what each marker's own name says.
    const box = map.getContainer();
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", "Map. Arrow keys move it; plus and minus zoom.");
    map.getPane("tooltipPane")?.setAttribute("aria-hidden", "true");
  }, [map]);
  useEffect(() => {
    const fit = () => {
      const pts: L.LatLngTuple[] = (here ? [here, ...focus] : hospitals).map((p) => [p.latitude, p.longitude]);
      if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [32, 32], maxZoom: here ? 15 : 12 });
    };
    fit();
    // The map can sit in a hidden layout (the list view) and be shown later: re-measure it, then frame it again.
    const box = map.getContainer();
    let width = box.clientWidth;
    const ro = new ResizeObserver(() => {
      if (box.clientWidth === width) return;
      const wasHidden = width === 0;
      width = box.clientWidth;
      map.invalidateSize();
      if (wasHidden) fit();
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [map, hospitals, here, focus]);
  return null;
}

export default function CareMapLeaflet({ hospitals, polyclinics, gps, here, focus, onOpen }: CareMapProps) {
  return (
    <MapContainer center={[1.3521, 103.8198]} zoom={11} minZoom={10} maxZoom={19} maxBounds={MAX_BOUNDS}
                  scrollWheelZoom={false} className="h-[380px] w-full rounded-xl sm:h-[460px]" attributionControl>
      <TileLayer url={ONEMAP_TILES} attribution={ONEMAP_ATTRIBUTION} detectRetina maxZoom={19} minZoom={11} />
      <Fit hospitals={hospitals} here={here} focus={focus} />
      {polyclinics.map((p) => (
        <CircleMarker key={p.name} center={[p.latitude, p.longitude]} radius={5}
                      pathOptions={{ color: colors.surface, weight: 1.5, fillColor: colors.accent, fillOpacity: 1 }}
                      eventHandlers={{ add: (e) => decorative(e.target as L.CircleMarker) }}>
          <Tooltip>{p.name}</Tooltip>
        </CircleMarker>
      ))}
      {gps.map((g) => (
        <CircleMarker key={`${g.name}|${g.latitude}`} center={[g.latitude, g.longitude]} radius={4}
                      pathOptions={{ color: colors.accent, weight: 2, fillColor: colors.surface, fillOpacity: 1 }}
                      eventHandlers={{ add: (e) => decorative(e.target as L.CircleMarker) }}>
          <Tooltip>{g.name}</Tooltip>
        </CircleMarker>
      ))}
      {hospitals.map((h) => (
        <CircleMarker key={h.code} center={[h.latitude, h.longitude]} radius={11}
                      pathOptions={{ color: colors.surface, weight: 2, fillColor: LEVEL_FILL[h.level], fillOpacity: 1 }}
                      eventHandlers={{
                        click: () => onOpen?.(h.code),
                        // A marker is an SVG path: make it a keyboard-reachable button, with its status in words.
                        add: (e) => makeButton(e.target as L.CircleMarker, h, onOpen),
                      }}>
          <Tooltip permanent direction="right" offset={[10, 0]} className="!text-xs !font-semibold">
            <span aria-hidden="true">{LEVELS[h.level].icon} </span>{h.code}
          </Tooltip>
        </CircleMarker>
      ))}
      {here ? (
        <CircleMarker center={[here.latitude, here.longitude]} radius={8}
                      pathOptions={{ color: colors.ink, weight: 3, fillColor: colors.surface, fillOpacity: 1 }}
                      eventHandlers={{ add: (e) => decorative(e.target as L.CircleMarker) }}>
          <Tooltip permanent direction="top" offset={[0, -8]}>{here.label}</Tooltip>
        </CircleMarker>
      ) : null}
    </MapContainer>
  );
}
