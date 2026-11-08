import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AreaCollection, Insight } from "@/lib/api/types";
import { priorityAreas, quadrant, shortfallBars } from "@/lib/accessCharts";
import { clinicMeta } from "@/lib/samples";

import { Map3DLegend } from "../map3d/Map3DLegend";
import { ViewTabs } from "../map/ViewTabs";
import { QuadrantChart } from "./QuadrantChart";
import { ShortfallBars } from "./ShortfallBars";

type Props = AreaCollection["features"][number]["properties"];
const area = (name: string, seniors: number | null, rate: number | null, shortfall: number | null, excluded: string | null = null): Props => ({
  planning_area_code: name.slice(0, 2).toUpperCase(), planning_area: name, region_name: null, population_year: 2026,
  residents_total: null, residents_65plus: seniors, chas_clinics: null, cdmp_clinics: null, clinics_per_1k_seniors: null,
  cdmp_clinics_per_1k_seniors: rate, pct_area_within_1km_of_cdmp: null, approx_km_centroid_to_nearest_polyclinic: null,
  nearest_polyclinic: null, dq_note: null, as_of: null, as_of_basis: null, excluded_reason: excluded, cdmp_shortfall: shortfall,
});
const AREAS = [area("Hougang", 50140, 1.0, 13.46), area("Bedok", 67290, 1.1, 11.17), area("Rochor", 3000, 5.02, -11),
               area("Tampines", 40000, 1.3, 4.2), area("Tengah", 300, 0, null, "fewer than 1,000 residents aged 65+")];
const finding = (entity: string): Insight => ({ type: "access_gap", entity } as Insight);

describe("the side charts' data", () => {
  it("priority follows the findings' order", () => {
    expect(priorityAreas([finding("Hougang"), { type: "weekday", entity: "SKH" } as Insight, finding("Bedok")]))
      .toEqual(["Hougang", "Bedok"]);
  });

  it("the quadrant has ranked areas only, split at their medians", () => {
    const q = quadrant(AREAS, ["Hougang", "Bedok"])!;
    expect(q.points.map((p) => p.name)).toEqual(["Hougang", "Bedok", "Rochor", "Tampines"]);       // Tengah isn't ranked
    expect(q.medianSeniors).toBe((40000 + 50140) / 2);
    expect(q.points.find((p) => p.name === "Bedok")!.rank).toBe(2);
  });

  it("shortfall bars: the priority areas, largest first, none invented", () => {
    const bars = shortfallBars(AREAS, ["Tampines", "Hougang", "Nowhere", "Bedok"]);
    expect(bars.map((b) => [b.name, b.shortfall])).toEqual([["Hougang", 13.46], ["Bedok", 11.17], ["Tampines", 4.2]]);
  });
});

describe("ShortfallBars", () => {
  it("lists the areas with their rounded shortfall and marks the top finding's area", () => {
    render(<ShortfallBars bars={shortfallBars(AREAS, ["Hougang", "Bedok"])} meta={clinicMeta} top="Hougang" />);
    const rows = screen.getAllByTestId("shortfall-bar");
    expect(rows.map((r) => r.textContent)).toEqual(["Hougangabout 13", "Bedokabout 11"]);
    expect(rows[0]).toHaveAttribute("data-top");
    expect(screen.getByTestId("provenance-line")).toHaveTextContent(/^Data as of 6 Jun 2024 · Source: data\.gov\.sg/);
  });
});

describe("QuadrantChart", () => {
  it("marks the priority areas, labels the top ones and points at the top finding", () => {
    const q = quadrant(AREAS, ["Hougang", "Bedok"])!;
    render(<QuadrantChart {...q} meta={clinicMeta} callout={{ name: "Hougang", text: "About 13 clinics short of the national rate" }} />);
    expect(screen.getByTestId("chart-callout")).toHaveTextContent("Hougang: About 13 clinics short of the national rate");
    expect(screen.getByTestId("chart-callout-arrow")).toHaveAttribute("data-target", "Hougang");
    expect(screen.getAllByTestId("quadrant-dot").filter((d) => d.hasAttribute("data-rank"))).toHaveLength(2);
    expect(screen.getByRole("img")).toHaveAccessibleName(/^4 areas\. 1\. Hougang: 50,140 aged 65\+, 1\.00 per 1,000; 2\. Bedok/);
    expect(screen.getByTestId("provenance-line")).toBeInTheDocument();
  });
});

describe("Map3DLegend", () => {
  it("states the height scale and the flat grey areas", () => {
    render(<Map3DLegend classes={[]} excluded={23} maxSeniors={67290} />);
    expect(screen.getByTestId("height-scale")).toHaveTextContent("Height: 10,000 residents aged 65+ per step. The tallest area has 67,290.");
    expect(screen.getByTestId("legend-excluded")).toHaveTextContent("Flat and grey: fewer than 1,000 residents aged 65+, so not ranked (23 areas)");
    expect(screen.getByTestId("map3d-legend")).toHaveTextContent("Darker means fewer chronic-care clinics per senior: worse access.");
  });
});

describe("ViewTabs", () => {
  it("links each view and marks the current one", () => {
    render(<ViewTabs active="3d" />);
    const nav = screen.getByRole("navigation", { name: "View" });
    expect(within(nav).getAllByRole("link").map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["3D map", "/access-map?view=3d"], ["2D map", "/access-map?view=map"], ["Table", "/access-map?view=table"]]);
    expect(within(nav).getByRole("link", { name: "3D map" })).toHaveAttribute("aria-current", "page");
  });
});
