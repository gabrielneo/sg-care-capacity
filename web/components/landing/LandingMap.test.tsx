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

  it("draws nothing when there is no geometry", () => {
    const { container } = render(<LandingMap features={[]} areas={[]} classes={[]} excluded={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
