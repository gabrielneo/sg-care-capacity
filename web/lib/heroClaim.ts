import type { Insight } from "./api/types";

/** The caveat shown next to a finding about a hospital whose MOH figures cover adults only (NUH). */
export const ADULT_ONLY_LINE = "Adults only: this hospital's figures leave out its children's emergency department.";

/**
 * The home page's claim: the engine's top-ranked headline finding, word for word, with the adults-only line when its caveats say
 * so. Null when no finding cleared the engine's bar: the page then says so, instead of promoting a weak one.
 */
export function heroClaim(insights: readonly Insight[]): { headline: string; caveat: string | null } | null {
  const top = insights.filter((i) => i.headline_rank != null && i.headline)
    .sort((x, y) => (x.headline_rank as number) - (y.headline_rank as number))[0];
  return top ? { headline: top.headline, caveat: top.caveats.some((c) => /adults only/i.test(c)) ? ADULT_ONLY_LINE : null } : null;
}
