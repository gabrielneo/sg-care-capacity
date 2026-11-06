/**
 * Typed API client for server components. Server-only: importing it from a client component
 * fails the build, so the API is never called from the browser (and the site needs no CORS).
 *
 * Every call is typed from api/openapi.json via lib/api/schema.d.ts: paths, query parameters and
 * response bodies are checked at compile time. A call resolves to {data, meta} or throws ApiError.
 *
 * Caching matches the API: it sends `Cache-Control: max-age=3600`, so Next revalidates each
 * response after REVALIDATE_SECONDS.
 */
import "server-only";

import createClient from "openapi-fetch";

import type { paths } from "./schema";
import type { Query } from "./types";

export const REVALIDATE_SECONDS = 3600;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiBaseUrl(): string {
  const url = process.env.API_BASE_URL?.trim();
  if (!url) {
    throw new ApiError(0, "not_configured", "API_BASE_URL is not set: copy web/.env.example to web/.env.local");
  }
  return url.replace(/\/+$/, "");
}

function client() {
  const baseUrl = apiBaseUrl();
  return createClient<paths>({
    baseUrl,
    // Next reads caching options from fetch's second argument; openapi-fetch passes a Request.
    fetch: (request: Request) => fetch(request, { next: { revalidate: REVALIDATE_SECONDS } }),
  });
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; field?: string | null };
}

async function call<T>(run: () => Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  let result: { data?: T; error?: unknown; response: Response };
  try {
    result = await run();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, "unreachable", `The API could not be reached (${(err as Error).message})`);
  }
  const { data, error, response } = result;
  if (error !== undefined || !response.ok) {
    const body = (error ?? {}) as ErrorEnvelope;
    throw new ApiError(
      response.status,
      body.error?.code ?? "http_error",
      body.error?.message ?? `The API answered ${response.status}`,
      body.error?.field ?? null,
    );
  }
  if (data === undefined) {
    throw new ApiError(response.status, "empty_response", "The API returned no body");
  }
  return data;
}

/** One function per endpoint. Each returns the endpoint's full {data, meta} body. */
export const api = {
  meta: () => call(() => client().GET("/api/v1/meta")),
  health: () => call(() => client().GET("/api/v1/health")),
  hospitals: () => call(() => client().GET("/api/v1/hospitals")),
  edDaily: (query: Query<"/api/v1/ed/daily"> = {}) =>
    call(() => client().GET("/api/v1/ed/daily", { params: { query } })),
  edWeekly: (query: Query<"/api/v1/ed/weekly"> = {}) =>
    call(() => client().GET("/api/v1/ed/weekly", { params: { query } })),
  edSummary: () => call(() => client().GET("/api/v1/ed/summary")),
  clinics: (query: Query<"/api/v1/clinics"> = {}) =>
    call(() => client().GET("/api/v1/clinics", { params: { query } })),
  areasAccess: () => call(() => client().GET("/api/v1/areas/access")),
  quality: () => call(() => client().GET("/api/v1/quality")),
  liveNuhsLatest: () => call(() => client().GET("/api/v1/live/nuhs/latest")),
};

export type Settled<T> = { ok: true; value: T } | { ok: false; error: ApiError };

/**
 * Await an API call and return the result or the ApiError, so a page can fetch first and render
 * after (React can't catch render errors in try/catch; this keeps fetching and rendering apart).
 */
export async function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err : new ApiError(0, "unexpected", String(err)) };
  }
}
