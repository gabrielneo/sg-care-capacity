import { describe, expect, it } from "vitest";

import type { Insight } from "./api/types";
import { ADULT_ONLY_LINE, heroClaim } from "./heroClaim";

const f = (headline: string, rank: number | null, caveats: string[] = []) => ({ headline, headline_rank: rank, caveats }) as unknown as Insight;

describe("heroClaim", () => {
  it("is null when no finding is a headline: the page says so rather than promote a weak one", () => {
    expect(heroClaim([])).toBeNull();
    expect(heroClaim([f("Weak one", null)])).toBeNull();
  });
  it("takes the lowest headline rank, word for word", () => {
    expect(heroClaim([f("Second", 2), f("First", 1), f("Not a headline", null)])).toEqual({ headline: "First", caveat: null });
  });
  it("carries the adults-only line next to an NUH finding", () => {
    expect(heroClaim([f("NUH peaks on Tuesdays", 1, ["MOH's figures for this hospital cover adults only."])])?.caveat).toBe(ADULT_ONLY_LINE);
  });
});
