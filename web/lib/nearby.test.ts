import { describe, expect, it } from "vitest";

import { km, kmText, locate, nearest, type Places, titleCase } from "./nearby";

const places: Places = {
  gps: [
    { name: "Alpha Clinic", address: "1 Bedok Rd", postal_code: "460001", latitude: 1.324, longitude: 103.93, planning_area: "BEDOK", has_cdmp: true },
    { name: "Bravo Clinic", address: "2 Bedok Rd", postal_code: "460099", latitude: 1.326, longitude: 103.94, planning_area: "BEDOK", has_cdmp: false },
    { name: "Charlie Clinic", address: "3 Jurong Rd", postal_code: "640001", latitude: 1.34, longitude: 103.70, planning_area: "JURONG WEST", has_cdmp: null },
  ],
  polyclinics: [{ name: "Bedok Polyclinic", address: "11 Bedok North St 1", postal_code: "469662", latitude: 1.326, longitude: 103.932 }],
  hospitals: [{ code: "CGH", name: "Changi General Hospital", address: null, postal_code: "529889", latitude: 1.3408, longitude: 103.9495, facility_type: "ED" }],
};

describe("locate", () => {
  it("uses a listed place's own point for its postcode", () => {
    expect(locate(" 469662 ", places)).toEqual({ ok: true, latitude: 1.326, longitude: 103.932, basis: "exact", label: "469662" });
  });

  it("falls back to the middle of the postcode's sector", () => {
    const r = locate("460123", places);
    expect(r).toMatchObject({ ok: true, basis: "sector" });
    if (r.ok) expect(r.latitude).toBeCloseTo((1.324 + 1.326 + 1.326) / 3, 6);   // both GPs and the polyclinic in 46
  });

  it("says why it can't place a postcode, and never guesses", () => {
    expect(locate("4601", places)).toEqual({ ok: false, reason: "short_postcode" });
    expect(locate("990000", places)).toEqual({ ok: false, reason: "unknown_postcode" });
    expect(locate("   ", places)).toEqual({ ok: false, reason: "empty" });
  });

  it("reads an area name, in any case, and a start of one", () => {
    expect(locate("bedok", places)).toMatchObject({ ok: true, basis: "area", label: "Bedok" });
    expect(locate("Jurong", places)).toMatchObject({ ok: true, basis: "area", label: "Jurong West" });
    expect(locate("Atlantis", places)).toEqual({ ok: false, reason: "unknown_area" });
  });
});

describe("titleCase", () => {
  it("capitalises words, not letters after an apostrophe", () => {
    expect(titleCase("CHOA CHU KANG")).toBe("Choa Chu Kang");
    expect(titleCase("PEOPLE'S PARK")).toBe("People's Park");
  });
});

describe("distances", () => {
  it("are great-circle km", () => {
    // 0.01 degrees of latitude is about 1.11 km anywhere.
    expect(km({ latitude: 1.3, longitude: 103.8 }, { latitude: 1.31, longitude: 103.8 })).toBeCloseTo(1.112, 2);
  });

  it("lists the nearest first", () => {
    const from = { latitude: 1.324, longitude: 103.93 };
    expect(nearest(from, places.gps, 2).map((n) => n.place.name)).toEqual(["Alpha Clinic", "Bravo Clinic"]);
  });

  it("formats short distances with one decimal", () => {
    expect([kmText(0.01), kmText(0.42), kmText(9.96), kmText(12.4)]).toEqual(["under 0.1 km", "0.4 km", "10.0 km", "12 km"]);
  });
});
