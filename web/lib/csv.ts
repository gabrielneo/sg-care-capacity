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

/** The table with the two provenance columns appended to every row (rowMeta: a row's own date and sources). */
export function withProvenance(columns: string[], rows: Cell[][], meta: Pick<Meta, "as_of" | "sources">,
                               rowMeta?: (index: number) => Pick<Meta, "as_of" | "sources">): { columns: string[]; rows: Cell[][] } {
  const sourceText = (m: Pick<Meta, "sources">) => m.sources.map((s) => s.name).join("; ");
  return {
    columns: [...columns, "data_as_of", "source"],
    rows: rows.map((r, i) => {
      const m = rowMeta ? rowMeta(i) : meta;            // rows from different sources carry their own (audit M-2)
      return [...r, m.as_of, sourceText(m)];
    }),
  };
}

/**
 * A CSV file: the columns, then one line per row, each with the provenance columns appended
 * (rowMeta gives a row its own date and sources, e.g. one finding's). A
 * spreadsheet formula injection guard is not needed: values come from the published release.
 */
export function toCsv(columns: string[], rows: Cell[][], meta: Pick<Meta, "as_of" | "sources">,
                      rowMeta?: (index: number) => Pick<Meta, "as_of" | "sources">): string {
  const t = withProvenance(columns, rows, meta, rowMeta);
  return `${[t.columns, ...t.rows].map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`;
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

/**
 * A chart's CSV with its context ahead of the table, as `#` comment lines: when the data is current, where it comes
 * from and what each measure means. The columns then follow exactly as in `toCsv`. Spreadsheets show the lines as
 * text; most readers (pandas `comment="#"`, R `comment.char`) skip them.
 */
export function toCsvWithContext(columns: string[], rows: Cell[][], meta: Pick<Meta, "as_of" | "sources">, context: { title: string; window?: string; definitions: string[] },
                                 rowMeta?: (index: number) => Pick<Meta, "as_of" | "sources">): string {
  const one = (s: string) => s.replace(/\s+/g, " ").trim();
  const header = [`# ${one(context.title)}`, `# data_as_of: ${meta.as_of}`, `# source: ${meta.sources.map((s) => one(s.name)).join("; ")}`,
                  ...(context.window ? [`# window: ${one(context.window)}`] : []),
                  ...context.definitions.map((d) => `# definition: ${one(d)}`)];
  return `${header.join("\r\n")}\r\n${toCsv(columns, rows, meta, rowMeta)}`;
}
