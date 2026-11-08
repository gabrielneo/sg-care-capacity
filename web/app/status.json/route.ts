/**
 * The footer's status line, as JSON: the data release the API serves. Fetched by the browser
 * (components/DataStatus.tsx), so static pages never call the API while the site is built: on
 * Vercel a sleeping API made every static page wait past the build's 60-second limit.
 */
import { api, settle } from "@/lib/api/client";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const res = await settle(api.meta());
  const body = res.ok
    ? { ok: true, snapshot_id: res.value.data.snapshot_id, release_url: res.value.data.release_url ?? null, as_of: res.value.meta.as_of }
    : { ok: false };
  return Response.json(body, {
    headers: { "Cache-Control": res.ok ? "public, s-maxage=300, stale-while-revalidate=3600" : "no-store" },
  });
}
