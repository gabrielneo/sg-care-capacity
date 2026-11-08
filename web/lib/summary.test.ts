import { describe, expect, it } from "vitest";

import { summaryAreas } from "./summary";

const area = (planning_area: string, residents_65plus: number | null, rate: number | null, cdmp_shortfall: number | null) =>
  ({ planning_area, residents_65plus, cdmp_clinics_per_1k_seniors: rate, cdmp_shortfall }) as unknown as Parameters<typeof summaryAreas>[1][number];

describe("summaryAreas", () => {
  const areas = [area("Bedok", 61000, 0.0164, 2.1), area("Tampines", 40000, 0.05, null), area("Yishun", 30000, 0.02, 4)];

  it("keeps the engine's priority order and caps the list", () => {
    const rows = summaryAreas(["Yishun", "Bedok", "Tampines"], areas, 2);
    expect(rows.map((r) => [r.rank, r.name])).toEqual([[1, "Yishun"], [2, "Bedok"]]);
    expect(rows[1]).toEqual({ rank: 2, name: "Bedok", seniors: 61000, rate: 0.0164, shortfall: 2.1 });
  });

  it("shows a missing shortfall as missing, never 0", () => {
    expect(summaryAreas(["Tampines"], areas)[0]!.shortfall).toBeNull();
  });

  it("keeps an area the data lacks, with no figures", () => {
    expect(summaryAreas(["Nowhere"], areas)).toEqual([{ rank: 1, name: "Nowhere", seniors: null, rate: null, shortfall: null }]);
  });

  it("is empty when there are no priority areas", () => {
    expect(summaryAreas([], areas)).toEqual([]);
  });
});
