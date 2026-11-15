import { describe, expect, it } from "vitest";

import { edMeta as meta } from "@/test/fixtures/meta";

import type { AreaCollection, LiveReading } from "./api/types";
import { accessPreview, edPreview, livePreview } from "./explore";
import type { StripData } from "./strip";

const strip = (over: Partial<StripData> = {}): StripData =>
  ({ total: 8, above: 3, noComparison: 0, week: "19–25 Oct 2026", pills: [], bed: null, ...over });
const areas = (rates: (number | null)[]) =>
  ({ type: "FeatureCollection", features: rates.map((r) => ({ properties: { cdmp_clinics_per_1k_seniors: r } })) }) as unknown as AreaCollection;
const reading = (site: string) => ({ site_name: site }) as LiveReading;

describe("Explore previews (audit G2)", () => {
  it("counts emergency departments above usual as the home page does, and names those with no comparison", () => {
    expect(edPreview(strip(), meta)?.figure).toBe("3 of 8 emergency departments above usual, week of 19–25 Oct 2026");
    expect(edPreview(strip({ total: 2, above: 1, noComparison: 1 }), meta)?.figure)
      .toBe("1 of 2 emergency departments above usual, week of 19–25 Oct 2026; 1 with no comparison");
  });

  it("counts only the planning areas with a clinic rate; a missing rate is not counted", () => {
    expect(accessPreview(areas([1.2, null, 0.4]), meta)?.figure).toBe("Clinics for each 1,000 residents aged 65+, in 2 planning areas");
    expect(accessPreview(areas([null]), meta)).toBeNull();
  });

  it("counts NUHS sites, not readings, and dates the estimate to the time", () => {
    const p = livePreview([reading("NUH"), reading("NUH"), reading("AH")], meta);
    expect(p?.figure).toBe("Estimates from 2 NUHS sites");
    expect(p?.withTime).toBe(true);
  });

  it("shows nothing when the data is missing, never a placeholder figure", () => {
    expect(edPreview(null, meta)).toBeNull();
    expect(edPreview(strip({ week: null }), meta)).toBeNull();
    expect(edPreview(strip(), null)).toBeNull();
    expect(accessPreview(null, meta)).toBeNull();
    expect(livePreview([], meta)).toBeNull();
  });
});
