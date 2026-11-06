import type { Metadata } from "next";

import { ComingNext } from "@/components/ComingNext";

export const metadata: Metadata = { title: "Access Map" };

export default function AccessMapPage() {
  return (
    <ComingNext
      title="Access Map"
      intro="Clinic access for residents aged 65+, by URA planning area."
      planned={[
        "Map of CDMP clinics per 1,000 residents aged 65+, with 'no data' shown distinctly",
        "Share of each area within 1 km of a CDMP clinic, and distance to the nearest polyclinic",
        "Each area's caveats in its tooltip",
      ]}
    />
  );
}
