"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { Skeleton } from "@/components/States";
import { Glossed } from "@/components/terms/Glossed";
import { LEVELS } from "@/lib/status";

import type { CareMapProps } from "./CareMapLeaflet";

const CareMapLeaflet = dynamic(() => import("./CareMapLeaflet"), {
  ssr: false,
  loading: () => <Skeleton className="h-[380px] w-full rounded-xl sm:h-[460px]" label="Loading map" />,
});

/**
 * The map loads only when it is about to scroll into view: Leaflet and the map tiles are the
 * heaviest things on the page, and most visitors read the cards first. Its height is reserved,
 * so nothing moves when it appears.
 */
export function CareMap(props: CareMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || show) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setShow(true), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [show]);

  return (
    <div>
      <div ref={box} role="region" aria-label="Map of hospital emergency departments and polyclinics. The same places are listed on this page."
           className="h-[380px] w-full overflow-hidden rounded-xl border border-line bg-page sm:h-[460px]" data-testid="care-map">
        {show ? <CareMapLeaflet {...props} /> : null}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Map key" data-testid="map-key">
        {(["much_higher", "higher", "usual", "unknown"] as const).map((l) => (
          <li key={l} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-3 w-3 rounded-full ${{ much_higher: "bg-bad", higher: "bg-warn", usual: "bg-ok", unknown: "bg-muted" }[l]}`} />
            Hospital: {l === "usual" ? "about usual or lower" : LEVELS[l].label.toLowerCase()}
          </li>
        ))}
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-accent" />Polyclinic</li>
        {props.gps.length ? (
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border-2 border-accent bg-surface" /><Glossed text="Nearest GP clinics" plain /></li>
        ) : null}
        {props.here ? (
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded-full border-[3px] border-ink bg-surface" />Your search</li>
        ) : null}
      </ul>
    </div>
  );
}
