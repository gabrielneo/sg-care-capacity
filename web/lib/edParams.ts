/** ED Trends filters, read from the URL (?hospital=SGH&hospital=CGH&from=2026-08-01&to=2026-10-31). */
export interface EdFilters {
  /** Selected hospital codes; empty = all. */
  hospitals: string[];
  from: string | null;
  to: string | null;
  /** Problems with the URL that were ignored, to tell the user. */
  notes: string[];
}

type Params = Record<string, string | string[] | undefined>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(v: string): boolean {
  if (!ISO_DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const all = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

export function parseEdFilters(params: Params, known: readonly string[]): EdFilters {
  const notes: string[] = [];
  const knownSet = new Set(known);
  const requested = all(params.hospital).flatMap((v) => v.split(",")).map((v) => v.trim().toUpperCase()).filter(Boolean);
  const hospitals = [...new Set(requested.filter((c) => knownSet.has(c)))];
  const unknown = requested.filter((c) => !knownSet.has(c));
  if (unknown.length) notes.push(`Ignored unknown hospital code${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}.`);
  const date = (key: "from" | "to") => {
    const v = all(params[key])[0]?.trim();
    if (!v) return null;
    if (validDate(v)) return v;
    notes.push(`Ignored "${key}=${v}": use a date like 2026-10-31.`);
    return null;
  };
  return { hospitals, from: date("from"), to: date("to"), notes };
}
