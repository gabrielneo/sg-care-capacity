import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AreaStyle, Svy21Feature } from "@/lib/map3d";

import { LandingMap } from "./LandingMap";

const square = (x: number): Svy21Feature["geometry"] =>
  ({ type: "Polygon", coordinates: [[[x, 0], [x + 1000, 0], [x + 1000, 1000], [x, 1000], [x, 0]]] }) as Svy21Feature["geometry"];
const f = (code: string, x: number) => ({ type: "Feature", geometry: square(x), properties: { planning_area_code: code } }) as unknown as Svy21Feature;
const a = (code: string, name: string, excluded = false): AreaStyle => ({ code, name, height: 0, color: "#440154", excluded, props: {} as AreaStyle["props"] });

describe("LandingMap", () => {
  it("names every area in one text node, says which are not ranked, and hatches them", () => {
    const { container } = render(<LandingMap features={[f("BD", 0), f("TS", 5000)]} areas={[a("BD", "Bedok"), a("TS", "Tuas", true)]}
                                 classes={[{ index: 0, min: 0.5, max: 1.2, count: 1, color: "#440154" }]} excluded={1} />);
    const titles = [...container.querySelectorAll("path > title")];
    expect(titles.map((t) => t.textContent)).toEqual(["Bedok", "Tuas: not ranked"]);
    expect(titles.every((t) => t.childNodes.length === 1)).toBe(true);
    expect(container.querySelector("path[data-excluded]")?.getAttribute("fill")).toBe("url(#landing-hatch)");
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toMatch(/2 planning areas.*Darker means fewer/);
  });

  it("gives the legend each group's range and the count of areas not ranked, in words", () => {
    const { getByTestId } = render(<LandingMap features={[f("BD", 0)]} areas={[a("BD", "Bedok")]}
                                  classes={[{ index: 0, min: 0.5, max: 1.2, count: 1, color: "#440154" }]} excluded={3} />);
    expect(getByTestId("landing-legend")).toHaveTextContent("Darker means fewer.");
    expect(getByTestId("landing-legend")).toHaveTextContent("0.50 to 1.20");
    expect(getByTestId("landing-legend")).toHaveTextContent("Not ranked (3)");
  });

  it("ranks meet with no gap, and the not-ranked areas are counted by the API's own reason", () => {
    const withReason = (code: string, reason: string) => ({ ...a(code, code, true), props: { excluded_reason: reason } as AreaStyle["props"] });
    const { getByTestId } = render(<LandingMap features={[f("BD", 0)]}
      areas={[a("BD", "Bedok"), withReason("TS", "no residents aged 65+"), withReason("WI", "no residents aged 65+"), withReason("DT", "fewer than 1,000 residents aged 65+")]}
      classes={[{ index: 0, min: 0, max: 0.8912, count: 1, color: "#440154" }, { index: 1, min: 0.9001, max: 1.3, count: 1, color: "#21918C" }]} excluded={3} />);
    expect(getByTestId("landing-legend")).toHaveTextContent("over 0.89 to 1.30");
    expect(getByTestId("landing-legend")).toHaveTextContent("0.00 to 0.89");
    expect(getByTestId("landing-not-ranked-reasons")).toHaveTextContent("no residents aged 65+ (2)fewer than 1,000 residents aged 65+ (1)");
  });

  it("names the fewest and the most clinics beside the map, and says when an area has few seniors", () => {
    const rated = (code: string, rate: number, note: string | null = null) => ({ ...a(code, code), props: { planning_area: code, cdmp_clinics_per_1k_seniors: rate, dq_note: note } as unknown as AreaStyle["props"] });
    const { getByTestId } = render(<LandingMap features={[f("A", 0)]}
      areas={[rated("Low", 0, "Fewer than 3,000 residents aged 65+: one clinic"), rated("Mid", 1.2), rated("Mid2", 1.3), rated("High", 5.02, "Fewer than 3,000 residents aged 65+: x"), { ...a("X", "X", true), props: { cdmp_clinics_per_1k_seniors: null } as unknown as AreaStyle["props"] }]}
      classes={[{ index: 0, min: 0, max: 5.02, count: 4, color: "#440154" }]} excluded={1} />);
    expect(getByTestId("landing-extremes")).toHaveTextContent("Fewest: Low 0.00 (few seniors), Mid 1.20.Most: High 5.02 (few seniors), Mid2 1.30.");
  });

  it("draws nothing when there is no geometry", () => {
    const { container } = render(<LandingMap features={[]} areas={[]} classes={[]} excluded={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
