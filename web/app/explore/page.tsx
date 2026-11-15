import type { Metadata } from "next";

import { Hub } from "@/components/Hub";
import { provenanceText } from "@/components/Provenance";
import { api, settle } from "@/lib/api/client";
import { accessPreview, edPreview, livePreview, type Preview } from "@/lib/explore";
import { SPARK_WEEKS } from "@/lib/status";
import { buildStrip } from "@/lib/strip";

export const metadata: Metadata = { title: "Explore" };
export const dynamic = "force-dynamic"; // rendered per request; API responses are cached for an hour

const shown = (p: Preview | null) => (p ? { figure: p.figure, provenance: provenanceText(p.meta, { withTime: p.withTime }) } : null);

/**
 * The Explore hub. Each card previews its page's latest figure (audit G2), built by the functions that page uses; a card whose
 * data can't be fetched shows no preview, and its link still works.
 */
export default async function ExplorePage() {
  const [hospitals, weekly, live, areas] = await Promise.all([
    settle(api.hospitals()),
    settle(api.edWeekly({ weeks: SPARK_WEEKS + 1 })),
    settle(api.liveNuhsLatest()),
    settle(api.areasAccess()),
  ]);
  const strip = hospitals.ok && weekly.ok
    ? buildStrip({ hospitals: hospitals.value.data, weekly: weekly.value.data, weeklyMeta: weekly.value.meta, live: live.ok ? live.value.data : [],
                   liveMeta: live.ok ? live.value.meta : null, now: new Date() })
    : null;

  return (
    <Hub title="Explore the data" intro="Pick the question you have. Each page shows its data's date and source."
         items={[
           { href: "/ed-trends", title: "Compare hospitals", text: "Daily bed waits and emergency department visits for one hospital, or side by side.",
             preview: shown(edPreview(strip, weekly.ok ? weekly.value.meta : null)) },
           { href: "/access-map", title: "See clinic access for seniors", text: "Clinics for each 1,000 residents aged 65 and over, by planning area, on a map or in a table.",
             preview: shown(accessPreview(areas.ok ? areas.value.data : null, areas.ok ? areas.value.meta : null)) },
           { href: "/live", title: "Check live waits", text: "The latest wait estimates some hospitals publish, next to the weekly figures.",
             preview: shown(livePreview(live.ok ? live.value.data : null, live.ok ? live.value.meta : null)) },
         ]} />
  );
}
