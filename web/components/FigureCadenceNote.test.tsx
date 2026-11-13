import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FigureCadenceNote } from "./FigureCadenceNote";

describe("FigureCadenceNote", () => {
  it("says the case study moves with published data, not weekly, and links to the weekly summary", () => {
    render(<FigureCadenceNote kind="case-study" />);
    expect(screen.getByTestId("cadence-note")).toHaveTextContent("not every week");
    expect(screen.getByRole("link", { name: "weekly summary" })).toHaveAttribute("href", "/?view=planner");
  });

  it("says findings are recomputed every Sunday and can repeat in a quiet week", () => {
    render(<FigureCadenceNote kind="findings" />);
    expect(screen.getByTestId("cadence-note")).toHaveTextContent("recomputed every Sunday");
    expect(screen.getByTestId("cadence-note")).toHaveTextContent("the same findings can appear again");
  });

  it("carries no date, so it can't go stale", () => {
    for (const kind of ["case-study", "findings"] as const) {
      const { container, unmount } = render(<FigureCadenceNote kind={kind} />);
      expect(container.textContent).not.toMatch(/20\d\d/);
      unmount();
    }
  });
});
