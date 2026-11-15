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

import { type Cell, csvResponse, toCsv, toCsvWithContext, withProvenance } from "./csv";
import { workbook } from "./xlsx";
import type { Meta } from "./api/types";

/**
 * A route's body: the plain table, or with `?context=1` (every chart's "Download CSV") the same table behind `#` lines with the
 * title, date, source, window and definitions.
 */
export function csvBody(request: Request, columns: string[], rows: Cell[][], meta: Pick<Meta, "as_of" | "sources">,
                        context: { title: string; window: string; definitions: string[] },
                        rowMeta?: (index: number) => Pick<Meta, "as_of" | "sources">): string {
  return new URL(request.url).searchParams.get("context") === "1"
    ? toCsvWithContext(columns, rows, meta, context, rowMeta)
    : toCsv(columns, rows, meta, rowMeta);
}

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * A chart's file: a CSV, or with `?format=xlsx` an Excel workbook of the same table (sheet "Data") with its title, date, source,
 * window and definitions on a sheet called "About". Both are named after the data and the release.
 */
export function tableResponse(request: Request, name: string, snapshotId: string, columns: string[], rows: Cell[][],
                              meta: Pick<Meta, "as_of" | "sources">, context: { title: string; window: string; definitions: string[] },
                              rowMeta?: (index: number) => Pick<Meta, "as_of" | "sources">): Response {
  if (new URL(request.url).searchParams.get("format") === "xlsx") {
    const t = withProvenance(columns, rows, meta, rowMeta);
    const about: [string, string][] = [["Title", context.title], ["data_as_of", meta.as_of], ["source", meta.sources.map((s) => s.name).join("; ")],
                                       ["window", context.window], ...context.definitions.map((d): [string, string] => ["definition", d])];
    return new Response(workbook(about, t.columns, t.rows) as BodyInit, {
      headers: { "Content-Type": XLSX_TYPE, "Content-Disposition": `attachment; filename="${name}-${snapshotId}.xlsx"`, "Cache-Control": "public, max-age=3600" },
    });
  }
  return csvResponse(csvBody(request, columns, rows, meta, context, rowMeta), name, snapshotId);
}
