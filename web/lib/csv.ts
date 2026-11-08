/**
 * CSV downloads (requirement S3): the figures behind a chart, for planners to check against their
 * own data. Every row carries the data's "as of" date and its source, as every figure on the site
 * does. Missing values are empty cells, never 0.
 */
import type { Meta } from "./api/types";

export type Cell = string | number | boolean | null | undefined;

/** RFC 4180: quote a cell holding a comma, quote or line break; double any quote inside it. */
export function cell(v: Cell): string {
  if (v == null) return "";
  const s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * A CSV file: the columns, then one line per row, each with the provenance columns appended
 * (rowMeta gives a row its own date and sources, e.g. one finding's). A
 * spreadsheet formula injection guard is not needed: values come from the published release.
 */
export function toCsv(columns: string[], rows: Cell[][], meta: Pick<Meta, "as_of" | "sources">,
                      rowMeta?: (index: number) => Pick<Meta, "as_of" | "sources">): string {
  const sourceText = (m: Pick<Meta, "sources">) => m.sources.map((s) => s.name).join("; ");
  const lines = [[...columns, "data_as_of", "source"].map(cell).join(",")];
  rows.forEach((r, i) => {
    const m = rowMeta ? rowMeta(i) : meta;            // rows from different sources carry their own (audit M-2)
    lines.push([...r, m.as_of, sourceText(m)].map(cell).join(","));
  });
  return `${lines.join("\r\n")}\r\n`;
}

/** The HTTP response for a CSV download, named after its data and release. */
export function csvResponse(body: string, name: string, snapshotId: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${snapshotId}.csv"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
