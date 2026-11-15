import { describe, expect, it } from "vitest";

import { placeAnnotations } from "./annotations";

const days = ["2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19"];
describe("placeAnnotations", () => {
  it("places events on their day, in date order, numbered from 1", () => {
    const placed = placeAnnotations([{ date: "2026-02-18", label: "B", kind: "holiday" }, { date: "2026-02-17", label: "Chinese New Year", kind: "holiday" }], days);
    expect(placed.map((p) => [p.n, p.index, p.label])).toEqual([[1, 1, "Chinese New Year"], [2, 2, "B"]]);
  });
  it("drops events outside the chart rather than pinning them to an edge", () => {
    expect(placeAnnotations([{ date: "2026-03-01", label: "x", kind: "holiday" }], days)).toEqual([]);
  });
  it("keeps two events on one day", () => {
    expect(placeAnnotations([{ date: "2026-02-17", label: "a", kind: "holiday" }, { date: "2026-02-17", label: "b", kind: "source_change" }], days)).toHaveLength(2);
  });
});
