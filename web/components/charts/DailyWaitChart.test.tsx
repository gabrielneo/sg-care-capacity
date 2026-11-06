import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DailyWaitChart } from "./DailyWaitChart";

const series = [{ code: "SGH", name: "Singapore General Hospital", style: { color: "#0072B2", dash: "" } }];

function pathFor(container: HTMLElement): string {
  const path = container.querySelector(".recharts-line-curve");
  return path?.getAttribute("d") ?? "";
}

describe("DailyWaitChart", () => {
  it("draws a missing day as a gap: the line restarts instead of joining across it", () => {
    const data = [
      { date: "2026-10-01", SGH: 4 }, { date: "2026-10-02", SGH: 5 },
      { date: "2026-10-03", SGH: null },                                     // MOH published nothing
      { date: "2026-10-04", SGH: 6 }, { date: "2026-10-05", SGH: 5 },
    ];
    const { container } = render(<DailyWaitChart data={data} series={series} width={600} />);
    const d = pathFor(container);
    expect(d.match(/M/g)).toHaveLength(2);                                  // two segments, not one line
  });

  it("draws an unbroken line when every day has a figure", () => {
    const data = [{ date: "2026-10-01", SGH: 4 }, { date: "2026-10-02", SGH: 5 }, { date: "2026-10-03", SGH: 6 }];
    const { container } = render(<DailyWaitChart data={data} series={series} width={600} />);
    expect(pathFor(container).match(/M/g)).toHaveLength(1);
  });
});
