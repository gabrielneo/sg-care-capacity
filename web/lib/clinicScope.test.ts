import { describe, expect, it } from "vitest";

import { clinicScope } from "./copy";

describe("clinicScope: what the clinic measure counts, with each source's own date", () => {
  it("names both dates, the polyclinic exclusion and what clinic counts leave out", () => {
    const text = clinicScope({ sources: [{ id: "datagov_chas", as_of: "2024-06-06T14:36:42" }, { id: "singstat_residents", as_of: "2026-06-30" }] });
    expect(text).toContain("CDMP GP clinics only: polyclinics are not included");
    expect(text).toContain("clinic list is from June 2024");
    expect(text).toContain("resident counts from June 2026");
    expect(text).toContain("opening hours, doctors, cost or transport");
  });

  it("never invents a date a source did not give", () => {
    const text = clinicScope({ sources: [{ id: "datagov_chas", as_of: null }] });
    expect(text).not.toMatch(/20\d\d/);
  });
});
