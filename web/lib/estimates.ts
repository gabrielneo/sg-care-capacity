/**
 * NUHS estimates as text. NUHS sometimes publishes a bound, "< 1 hour(s)": the API then gives the
 * bound (1) with a qualifier ("<"), and the site says "under 1 hour", never "1 hour" (audit C-1).
 */
export type Bound = "<" | ">" | null | undefined;

export function estimateText(hours: number | null, bound: Bound = null): string {
  if (hours == null) return "Not stated";
  const n = Number.isInteger(hours) ? String(hours) : hours.toLocaleString("en-SG", { maximumFractionDigits: 1 });
  const unit = hours === 1 ? "hour" : "hours";
  if (bound === "<") return `under ${n} ${unit}`;
  if (bound === ">") return `over ${n} ${unit}`;
  return `${n} ${unit}`;
}

/** "Under 1 hour" at the start of a value cell. */
export function estimateCell(hours: number | null, bound: Bound = null): string {
  const t = estimateText(hours, bound);
  return t.charAt(0).toUpperCase() + t.slice(1);
}
