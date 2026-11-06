import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { metricByKey } from "@/lib/areaMetrics";
import { legendClasses, quantileBreaks } from "@/lib/quantiles";

import { MapLegend } from "./MapLegend";

describe("MapLegend", () => {
  const values = [0.5, 1.1, 1.2, 1.4, 2.0, 3.3, 5.7, 100, null, null];
  const breaks = quantileBreaks(values);

  it("states the method, each class's range and count, and the no-data count", () => {
    render(<MapLegend metric={metricByKey("clinics_per_1k_seniors")} classes={legendClasses(values, breaks)} noData={2} smallAreas={1} />);
    const legend = screen.getByTestId("map-legend");
    expect(legend).toHaveTextContent("Darker means more clinics: better access.");
    expect(legend).toHaveTextContent("The map is shaded in five groups with equal numbers of areas");
    expect(legend).not.toHaveTextContent(/quantile/i);
    expect(legend).toHaveTextContent("0.50 – 1.10 per 1,000 aged 65+ (2 areas)");
    expect(legend).toHaveTextContent("No data (2 areas");
    expect(legend).toHaveTextContent("1 of the areas shown have fewer than 1,000 residents aged 65+");
  });

  it("says darker is worse for distance", () => {
    render(<MapLegend metric={metricByKey("approx_km_centroid_to_nearest_polyclinic")} classes={[]} noData={0} />);
    expect(screen.getByTestId("map-legend")).toHaveTextContent("Darker means farther: worse access.");
  });
});
