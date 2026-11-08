import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { edMeta } from "@/test/fixtures/meta";

import { api, ApiError, REVALIDATE_SECONDS, revalidateSeconds, settle } from "./client";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("API_BASE_URL", "http://api.test/");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("api client", () => {
  it("returns {data, meta} and calls the configured base URL with the query string", async () => {
    fetchMock.mockResolvedValue(json({ data: [], meta: edMeta }));
    const body = await api.edDaily({ hospital: "SGH", from: "2026-10-01" });
    expect(body.meta.as_of).toBe("2026-10-31");
    const [request] = fetchMock.mock.calls[0] as [Request, RequestInit];
    expect(request.url).toBe("http://api.test/api/v1/ed/daily?hospital=SGH&from=2026-10-01");
    expect(request.method).toBe("GET");
  });

  it("revalidates as often as the API's max-age", async () => {
    fetchMock.mockResolvedValue(json({ data: [], meta: edMeta }));
    await api.edSummary();
    const [, init] = fetchMock.mock.calls[0] as [Request, RequestInit & { next?: { revalidate?: number } }];
    expect(init.next?.revalidate).toBe(REVALIDATE_SECONDS);
    expect(REVALIDATE_SECONDS).toBe(3600);
  });

  it("revalidates after API_REVALIDATE_SECONDS when it is set", async () => {
    vi.stubEnv("API_REVALIDATE_SECONDS", "900");
    fetchMock.mockResolvedValue(json({ data: [], meta: edMeta }));
    await api.edSummary();
    const [, init] = fetchMock.mock.calls[0] as [Request, RequestInit & { next?: { revalidate?: number } }];
    expect(init.next?.revalidate).toBe(900);
  });

  it.each([
    [undefined, 3600], ["", 3600], ["  ", 3600], ["1800", 1800], [" 60 ", 60], ["86400", 86400],
    ["59", 3600], ["86401", 3600], ["0", 3600], ["-5", 3600], ["1.5", 3600], ["1h", 3600], ["abc", 3600],
  ])("API_REVALIDATE_SECONDS=%j gives %i (bad values fall back to an hour)", (value, expected) => {
    expect(revalidateSeconds(value)).toBe(expected);
  });

  it("turns the API's error envelope into an ApiError with its code and field", async () => {
    fetchMock.mockResolvedValue(json({ data: null, meta: edMeta, error: {
      code: "unknown_hospital", message: "unknown hospital 'XYZ'", field: "hospital" } }, 400));
    const err = await api.edDaily({ hospital: "XYZ" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: "unknown_hospital", field: "hospital",
                                message: "unknown hospital 'XYZ'" });
  });

  it("reports an unreachable API as an ApiError, not a raw TypeError", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(api.meta()).rejects.toMatchObject({ code: "unreachable", status: 0 });
  });

  it("refuses to run without API_BASE_URL", async () => {
    vi.stubEnv("API_BASE_URL", "");
    await expect(api.meta()).rejects.toMatchObject({ code: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("insights", () => {
  it("passes its filters as the query string", async () => {
    fetchMock.mockResolvedValue(json({ data: [], meta: edMeta }));
    await api.insights({ type: "weekday", headline: true, top: 3 });
    const [request] = fetchMock.mock.calls[0] as [Request, RequestInit];
    expect(request.url).toBe("http://api.test/api/v1/insights?type=weekday&headline=true&top=3");
  });
});

describe("population", () => {
  it("calls /population with no parameters", async () => {
    fetchMock.mockResolvedValue(json({ data: [], meta: edMeta }));
    await api.population();
    const [request] = fetchMock.mock.calls[0] as [Request, RequestInit];
    expect(request.url).toBe("http://api.test/api/v1/population");
  });
});

describe("settle", () => {
  it("returns the value or the ApiError, so pages fetch first and render after", async () => {
    expect(await settle(Promise.resolve(1))).toEqual({ ok: true, value: 1 });
    const failed = await settle(Promise.reject(new ApiError(503, "unavailable", "down")));
    expect(failed).toMatchObject({ ok: false, error: { code: "unavailable", status: 503 } });
    const odd = await settle(Promise.reject(new Error("boom")));
    expect(odd).toMatchObject({ ok: false, error: { code: "unexpected" } });
  });
});
