import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionCrumb } from "./SectionCrumb";

describe("SectionCrumb", () => {
  it("names the section as a link back to it and marks the page as current, in a labelled breadcrumb", () => {
    render(<SectionCrumb section="About" href="/about" page="The project in 60 seconds" />);
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    expect(within(nav).getByText("The project in 60 seconds")).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByText("›")).toHaveAttribute("aria-hidden", "true");
  });
});
