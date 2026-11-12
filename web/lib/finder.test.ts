import { describe, expect, it } from "vitest";

import { announcement, directionsUrl, nearestPlaces, parseType, TYPE_LABEL } from "./finder";
import type { Places } from "./nearby";

const gp = (name: string, lat: number, lon: number, postal = "460001") => ({
  name, address: "1 Some Rd", postal_code: postal, latitude: lat, longitude: lon, planning_area: "BEDOK", has_cdmp: null });
const poly = (name: string, lat: number, lon: number) => ({ name, address: "2 Some Rd", postal_code: "469662", latitude: lat, longitude: lon });
const from = { latitude: 1.32, longitude: 103.93 };

// About 0.11 km per 0.001 degree of latitude.
const places: Pick<Places, "gps" | "polyclinics"> = {
  gps: [gp("Far Clinic", 1.34, 103.93), gp("Near Clinic", 1.321, 103.93), gp("Mid Clinic", 1.325, 103.93)],
  polyclinics: [poly("Bedok Polyclinic", 1.323, 103.93), poly("Distant Polyclinic", 1.40, 103.93)],
};

describe("nearestPlaces", () => {
  it("lists GP clinics and polyclinics together, nearest first", () => {
    const r = nearestPlaces(from, places);
    expect(r.map((x) => x.name)).toEqual(["Near Clinic", "Bedok Polyclinic", "Mid Clinic", "Far Clinic", "Distant Polyclinic"]);
    expect(r.map((x) => x.type)).toEqual(["gp", "polyclinic", "gp", "gp", "polyclinic"]);
    for (let i = 1; i < r.length; i++) expect(r[i]!.km).toBeGreaterThanOrEqual(r[i - 1]!.km);
  });

  it("filters by kind", () => {
    expect(nearestPlaces(from, places, "gp").map((x) => x.name)).toEqual(["Near Clinic", "Mid Clinic", "Far Clinic"]);
    expect(nearestPlaces(from, places, "polyclinic").map((x) => x.name)).toEqual(["Bedok Polyclinic", "Distant Polyclinic"]);
  });

  it("keeps the nearest few, and sorts on the exact distance, not the rounded one", () => {
    expect(nearestPlaces(from, places, "all", 2).map((x) => x.name)).toEqual(["Near Clinic", "Bedok Polyclinic"]);
    // 0.11 km and 0.12 km both show as "0.1 km", but the nearer one still goes first.
    const close = { gps: [gp("B", 1.3211, 103.93), gp("A", 1.3210, 103.93)], polyclinics: [] };
    expect(nearestPlaces(from, close).map((x) => x.name)).toEqual(["A", "B"]);
  });

  it("breaks ties by name, never by the order the lists arrived in", () => {
    const tie = { gps: [gp("Zed", 1.321, 103.93), gp("Alpha", 1.321, 103.93)], polyclinics: [] };
    expect(nearestPlaces(from, tie).map((x) => x.name)).toEqual(["Alpha", "Zed"]);
    expect(nearestPlaces(from, { gps: tie.gps.toReversed(), polyclinics: [] }).map((x) => x.name)).toEqual(["Alpha", "Zed"]);
  });

  it("gives nothing for empty lists", () => {
    expect(nearestPlaces(from, { gps: [], polyclinics: [] })).toEqual([]);
  });
});

describe("directionsUrl", () => {
  it("carries the place's coordinates and nothing about the person", () => {
    const url = new URL(directionsUrl({ latitude: 1.3245678, longitude: 103.9301234 }));
    expect(url.origin).toBe("https://www.google.com");
    expect(url.searchParams.get("destination")).toBe("1.324568,103.930123");
    expect(url.searchParams.has("origin")).toBe(false);
    expect([...url.searchParams.keys()].sort()).toEqual(["api", "destination"]);
  });
});

describe("parseType", () => {
  it("falls back to all", () => {
    expect(parseType("gp")).toBe("gp");
    expect(parseType("polyclinic")).toBe("polyclinic");
    for (const v of [undefined, null, "", "GP", "clinic"]) expect(parseType(v)).toBe("all");
  });
});

describe("labels", () => {
  it("says every GP clinic listed is on CHAS", () => {
    expect(TYPE_LABEL).toEqual({ gp: "GP clinic on CHAS", polyclinic: "Polyclinic" });
  });
});

describe("announcement (the live region)", () => {
  it("says how many, where, and the nearest, in a straight line", () => {
    const r = nearestPlaces(from, places);
    expect(announcement("460002", r)).toBe("5 places near 460002. Nearest: Near Clinic, 0.1 km in a straight line.");
    expect(announcement("460002", nearestPlaces(from, places, "gp"), "gp")).toMatch(/^3 GP clinics near 460002\./);
    expect(announcement("Bedok", [{ name: "A", km: 0.01 }], "polyclinic")).toBe("1 polyclinic near Bedok. Nearest: A, under 0.1 km in a straight line.");
  });

  it("says when nothing is found, and never says fastest", () => {
    expect(announcement("Bedok", [], "gp")).toBe("No GP clinics found near Bedok.");
    expect(announcement("x", nearestPlaces(from, places))).not.toMatch(/fast|quick|minute/i);
  });
});
