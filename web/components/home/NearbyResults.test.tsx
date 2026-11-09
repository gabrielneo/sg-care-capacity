import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createScope, setTestScope } from "@/lib/termScope";

import { type NearbyLists, NearbyResults } from "./NearbyResults";

const place = (name: string) => ({ name, address: "1 Some St", postal_code: "460001", latitude: 1.32, longitude: 103.93 });
const lists = (over: Partial<NearbyLists> = {}): NearbyLists => ({
  gps: [{ place: { ...place("Alpha Clinic"), has_cdmp: true }, km: 0.2 }],
  polyclinics: [{ place: place("Bedok Polyclinic"), km: 0.7 }],
  hospitals: [{ place: { ...place("Changi General Hospital"), code: "CGH" }, km: 1.9 }],
  ...over,
});
const at = { ok: true as const, latitude: 1.32, longitude: 103.93, basis: "sector" as const, label: "460123" };

afterEach(() => setTestScope(null));

describe("NearbyResults", () => {
  it("shows polyclinics, GP clinics and EDs", () => {
    setTestScope(createScope());
    render(<NearbyResults located={at} lists={lists()} clinicMeta={null} polyclinicMeta={null} />);
    expect(screen.getByTestId("nearby-polyclinics")).toHaveTextContent("Bedok Polyclinic");
    expect(screen.getByTestId("nearby-gps")).toHaveTextContent("Alpha Clinic");
    expect(screen.getByTestId("nearby-hospitals")).toHaveTextContent("Changi General Hospital");
  });

  it("leaves out a column the data release has no places for, instead of showing it empty", () => {
    setTestScope(createScope());
    render(<NearbyResults located={at} lists={lists({ polyclinics: [], hospitals: [] })} clinicMeta={null} polyclinicMeta={null} />);
    expect(screen.queryByTestId("nearby-polyclinics")).toBeNull();
    expect(screen.queryByTestId("nearby-hospitals")).toBeNull();
    expect(screen.getByTestId("nearby-gps")).toHaveTextContent("Alpha Clinic");
  });
});
