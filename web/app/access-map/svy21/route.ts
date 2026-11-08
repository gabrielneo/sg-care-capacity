/**
 * The 3D map layer for the browser. The API is only ever called from the server, so the 3D map
 * fetches its geometry here (only when the 3D view opens), keeping the page's HTML light.
 */
import { api, settle } from "@/lib/api/client";
import { plainError } from "@/lib/copy";

export async function GET() {
  const result = await settle(api.areasAccessSvy21());
  if (!result.ok) {
    const missing = result.error.status === 404;
    return Response.json({ error: { code: result.error.code, message: plainError(result.error).message } },
                         { status: missing ? 404 : 502 });
  }
  return Response.json(result.value, { headers: { "Cache-Control": "public, max-age=3600" } });
}
