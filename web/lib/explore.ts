/**
 * The Explore hub's previews (audit G2): one figure per card, from the same data and the same functions as the page it
 * links to, so the hub never says something the page doesn't. Each preview carries the meta that dates it; the card
 * states that date and source once. No figure, no preview: a card without data says nothing, rather than a weaker line.
 */
import type { AreaCollection, LiveReading, Meta } from "./api/types";
import type { StripData } from "./strip";

export interface Preview {
  figure: string;
  meta: Meta;
  /** The date has a time of day (a live reading), not only a day. */
  withTime?: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The home page's count (lib/strip.ts): full EDs only, the urgent care centre left out (ADR 0012). */
export function edPreview(strip: StripData | null, meta: Meta | null): Preview | null {
  if (!strip || !meta || strip.total === 0 || !strip.week) return null;
  // "1 of 2", as the home page's tile counts it: the total includes the EDs with no comparison, named after it.
  const head = `${strip.above} of ${plural(strip.total, "emergency department", "emergency departments")} above usual, week of ${strip.week}`;
  // Hospitals with nothing to compare against are said separately, never counted as "not above usual".
  return { figure: strip.noComparison ? `${head}; ${strip.noComparison} with no comparison` : head, meta };
}

/** How many planning areas the Access Map can shade: those with a clinic rate. Missing rates are not counted. */
export function accessPreview(areas: AreaCollection | null, meta: Meta | null): Preview | null {
  if (!areas || !meta) return null;
  const n = areas.features.filter((f) => f.properties.cdmp_clinics_per_1k_seniors != null).length;
  return n ? { figure: `Clinics for each 1,000 residents aged 65+, in ${plural(n, "planning area", "planning areas")}`, meta } : null;
}

/** How many NUHS sites the latest estimates cover, with the reading's time. */
export function livePreview(readings: LiveReading[] | null, meta: Meta | null): Preview | null {
  if (!readings?.length || !meta) return null;
  const sites = new Set(readings.map((r) => r.site_name)).size;
  return { figure: `Estimates from ${plural(sites, "NUHS site", "NUHS sites")}`, meta, withTime: true };
}
