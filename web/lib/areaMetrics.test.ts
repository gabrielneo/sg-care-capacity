import { describe, expect, it } from "vitest";

import { type AreaProps, formatValue, metricByKey, sortAreas } from "./areaMetrics";

const area = (name: string, v: number | null): AreaProps => ({
  planning_area_code: name.slice(0, 2).toUpperCase(), planning_area: name, region_name: "R", population_year: 2026,
  residents_total: 1, residents_65plus: 1, chas_clinics: 1, cdmp_clinics: 1, clinics_per_1k_seniors: v,
  cdmp_clinics_per_1k_seniors: v, pct_area_within_1km_of_cdmp: v, approx_km_centroid_to_nearest_polyclinic: v,
  nearest_polyclinic: null, dq_note: null, as_of: "2024-06-06T14:36:42", as_of_basis: "source_updated" });

describe("area metrics", () => {
  it("falls back to the default metric for an unknown key", () => {
    expect(metricByKey("nope").key).toBe("clinics_per_1k_seniors");
    expect(metricByKey("approx_km_centroid_to_nearest_polyclinic").higherIsBetter).toBe(false);
  });

  it("shows missing values as 'No data', never 0", () => {
    expect(formatValue(null, 2)).toBe("No data");
    expect(formatValue(0, 2)).toBe("0.00");
    expect(formatValue(1.2345, 2)).toBe("1.23");
  });

  it("sorts either way with missing values always last", () => {
    const rows = [area("Bedok", 1.2), area("Tuas", null), area("Ang Mo Kio", 2.5), area("Changi", 0)];
    const names = (r: { rows: AreaProps[] }) => r.rows.map((a) => a.planning_area);
    expect(names(sortAreas(rows, "clinics_per_1k_seniors", "asc"))).toEqual(["Changi", "Bedok", "Ang Mo Kio", "Tuas"]);
    expect(names(sortAreas(rows, "clinics_per_1k_seniors", "desc"))).toEqual(["Ang Mo Kio", "Bedok", "Changi", "Tuas"]);
    expect(sortAreas(rows, "evil;drop", "sideways")).toMatchObject({ key: "planning_area", dir: "asc" });
  });
});

describe("areaValueText", () => {
  it("says a per-senior ratio is not applicable where no seniors live, not that data is missing (audit L-5)", async () => {
    const { areaValueText, NOT_APPLICABLE } = await import("./areaMetrics");
    expect(areaValueText({ residents_65plus: 0, cdmp_clinics_per_1k_seniors: null }, "cdmp_clinics_per_1k_seniors", 2)).toBe(NOT_APPLICABLE);
    expect(areaValueText({ residents_65plus: null, cdmp_clinics_per_1k_seniors: null }, "cdmp_clinics_per_1k_seniors", 2)).toBe("No data");
    expect(areaValueText({ residents_65plus: 0, chas_clinics: 3 }, "chas_clinics", 0)).toBe("3");
    expect(areaValueText({ residents_65plus: 900, clinics_per_1k_seniors: 1.234 }, "clinics_per_1k_seniors", 2)).toBe("1.23");
  });
});
