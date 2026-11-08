/** Shared by the CSV routes in app/export/. */
import "server-only";

import type { ApiError } from "./api/client";
import { plainError } from "./copy";

/** An API failure as a plain-text response: a CSV is never half-written or silently empty. */
export function exportError(err: ApiError): Response {
  const status = err.status >= 400 && err.status < 500 ? err.status : 502;
  return new Response(`${plainError(err).message} (reference: ${err.code})\n`, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export const all = (v: string | null) => (v ? v.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : []);
