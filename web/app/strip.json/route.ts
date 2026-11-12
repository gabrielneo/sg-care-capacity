/**
 * The site strip's content as JSON (components/SiteStrip.tsx): hospitals above usual, and how fresh
 * each dataset is. Fetched by the browser, so static pages never call the API while the site is built.
 * Ages are worked out here, from each source's own as_of in the API's meta (lib/strip.ts).
 */
import { api, settle } from "@/lib/api/client";
import { SPARK_WEEKS } from "@/lib/status";
import { buildStrip } from "@/lib/strip";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const [hospitals, weekly, live] = await Promise.all([settle(api.hospitals()), settle(api.edWeekly({ weeks: SPARK_WEEKS + 1 })), settle(api.liveNuhsLatest())]);
  const strip = hospitals.ok && weekly.ok
    ? buildStrip({
        hospitals: hospitals.value.data, weekly: weekly.value.data, weeklyMeta: weekly.value.meta,
        live: live.ok ? live.value.data : [], liveMeta: live.ok ? live.value.meta : null, now: new Date(),
      })
    : null;
  return Response.json(strip ? { ok: true, strip } : { ok: false }, {
    headers: { "Cache-Control": strip ? "public, s-maxage=300, stale-while-revalidate=3600" : "no-store" },
  });
}
