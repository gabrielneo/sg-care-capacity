import { describe, expect, it } from "vitest";

import { childMeta, inheritsFrom, provenanceKey } from "./sectionMeta";

const moh = { id: "moh_bed_wait", name: "MOH, Waiting Time for Admission to Ward", url: null, as_of: "2026-11-07", as_of_basis: null, last_fetched_at: null };
const nuhs = { id: "nuhs_live", name: "NUHS, ED waiting time", url: null, as_of: "2026-11-11", as_of_basis: null, last_fetched_at: null };
const section = { as_of: "2026-11-07", sources: [moh] };

describe("childMeta", () => {
  it("is null when the child has the section's date and sources", () => {
    expect(childMeta(section, { as_of: "2026-11-07", sources: [{ ...moh }] })).toBeNull();
  });
  it("is null when the child has no meta of its own", () => {
    expect(childMeta(section, null)).toBeNull();
    expect(childMeta(section, undefined)).toBeNull();
  });
  it("returns the child's meta when its date differs", () => {
    const own = { as_of: "2026-11-11", sources: [moh] };
    expect(childMeta(section, own)).toBe(own);
  });
  it("returns the child's meta when its source differs, even on the same date", () => {
    const own = { as_of: "2026-11-07", sources: [nuhs] };
    expect(childMeta(section, own)).toBe(own);
  });
  it("ignores the order of the sources", () => {
    const both = { as_of: "2026-11-07", sources: [moh, nuhs] };
    expect(inheritsFrom(both, { as_of: "2026-11-07", sources: [nuhs, moh] })).toBe(true);
    expect(provenanceKey(both)).toBe(provenanceKey({ as_of: "2026-11-07", sources: [nuhs, moh] }));
  });
});
