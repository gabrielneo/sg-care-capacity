/**
 * The place lists the clinic finder searches in the browser: CHAS GP clinics, polyclinics and
 * hospital EDs, with their map points. Fetched by the page's script the first time someone starts a
 * search. The request carries nothing the person typed: matching and distances happen in the browser.
 */
import { api, settle } from "@/lib/api/client";
import { fetchAllPages } from "@/lib/paging";
import { buildPlaces } from "@/lib/placesPayload";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  // About 1,200 clinics: 3 pages of 500, asked for at once.
  const [clinics, polyclinics, hospitals] = await Promise.all([
    settle(fetchAllPages(async (offset, limit) => (await api.clinics({ limit, offset })).data, 500, 20, 3)),
    settle(api.polyclinics()),
    settle(api.hospitals()),
  ]);
  if (!clinics.ok || !hospitals.ok) return Response.json({ error: "unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  const places = buildPlaces(clinics.value.items, polyclinics.ok ? polyclinics.value.data : [], hospitals.value.data);
  return Response.json(places, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
