import { describe, expect, it } from "vitest";

import { divergingClasses, sequentialClasses } from "./edCompare";
import { legendEnds, legendLabels } from "./heatLegend";

describe("heatmap legend", () => {
  const classes = divergingClasses([-61, 5, 61]);
  it("has seven equal bins, symmetric about 0", () => {
    expect(classes).toHaveLength(7);
    expect(classes[0]!.min).toBe(-61);
    expect(classes[6]!.max).toBeCloseTo(61, 9);
    const widths = classes.map((c) => c.max - c.min);
    for (const w of widths) expect(w).toBeCloseTo(widths[0]!, 9);
  });
  it("labels each bin from its own edges, sharing edges with its neighbours", () => {
    const labels = legendLabels(classes, "usual");
    expect(labels[0]).toBe("−61 to −44%");
    expect(labels[3]).toBe("−9 to +9%");
    expect(labels[6]).toBe("+44 to +61%");
    expect(labels.every((l) => l.endsWith("%"))).toBe(true);
  });
  it("adds decimals when the bins are narrower than a point, so no bin reads \"0 to 0%\"", () => {
    const labels = legendLabels(divergingClasses([0.3, -0.3]), "usual");   // m = 1 (the scale never goes under ±1): 0.29-wide bins
    expect(labels[3]).toBe("−0.1 to +0.1%");
    expect(new Set(labels).size).toBe(7);
  });
  it("raw mode labels hours", () => {
    expect(legendLabels(sequentialClasses([3, 8]), "raw")[0]).toBe("3.0–4.0 h");
  });
  it("names both ends, shorter first", () => {
    expect(legendEnds("usual")).toEqual(["Shorter than usual", "Longer than usual"]);
  });
});
