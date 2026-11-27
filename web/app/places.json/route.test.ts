import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { edMeta } from "@/test/fixtures/meta";

import { GET as svy21 } from "../access-map/svy21/route";
import { GET } from "./route";

const ok = (data: unknown) => new Response(JSON.stringify({ data, meta: edMeta }), { status: 200, headers: { "Content-Type": "application/json" } });

function serve(polyclinics: "ok" | "down") {
  vi.stubGlobal("fetch", vi.fn(async (input: Request | string) => {
    const path = new URL(input instanceof Request ? input.url : input).pathname;
    if (path.endsWith("/clinics")) return ok({ items: [], total: 0 });
    if (path.endsWith("/hospitals")) return ok([]);
    if (path.endsWith("/polyclinics")) return polyclinics === "ok" ? ok([]) : new Response("{}", { status: 503 });
    return new Response("{}", { status: 503 });                          // /health: unkeyed, as when it is down
  }));
}

beforeEach(() => vi.stubEnv("API_BASE_URL", "http://api.test"));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("places.json", () => {
  it("is cached at the edge when every list arrived", async () => {
    serve("ok");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
  });

  it("is served but never cached when the polyclinic list is missing (R4)", async () => {
    serve("down");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("the 3D layer's error is never cached either", async () => {
    serve("down");
    const res = await svy21();
    expect(res.status).toBe(502);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
