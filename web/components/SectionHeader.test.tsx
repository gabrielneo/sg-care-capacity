import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { edMeta } from "@/test/fixtures/meta";

import { SectionHeader } from "./SectionHeader";

describe("SectionHeader", () => {
  it("has three rows: the heading and freshness pill, the lede, then the window, source and date once", () => {
    render(<SectionHeader id="x-heading" title="How did bed waits compare?" lede="A one-sentence answer." meta={edMeta} window="Latest complete week (19–25 Oct 2026)" />);
    expect(screen.getByRole("heading", { level: 2, name: "How did bed waits compare?" })).toHaveAttribute("id", "x-heading");
    expect(screen.getByTestId("freshness-badge")).toBeInTheDocument();
    expect(screen.getByText("A one-sentence answer.")).toBeInTheDocument();
    const meta = screen.getByTestId("section-meta");
    expect(meta).toHaveTextContent(/^Latest complete week \(19–25 Oct 2026\) · Source: .+ · Data as of 31 Oct 2026/);
    expect(screen.getAllByText(/Data as of/)).toHaveLength(1);
  });

  it("the link goes to the methodology unless the section has its own popover, whose label can differ", () => {
    const { unmount } = render(<SectionHeader id="a" title="T" meta={edMeta} />);
    expect(screen.getByRole("link", { name: "How this is measured" })).toHaveAttribute("href", "/methodology");
    unmount();
    render(<SectionHeader id="b" title="T" meta={edMeta} measureLabel="What the badges mean" measure={<span>Usual = the median.</span>} />);
    const help = screen.getByTestId("measure-help");
    expect(within(help).getByRole("button", { name: "What the badges mean" })).toBeInTheDocument();
    expect(within(help).getByRole("tooltip")).toHaveTextContent("Usual = the median.");
  });

  it("omits the window when there is none, and shows an aside beside the lede", () => {
    render(<SectionHeader id="c" title="T" meta={edMeta} lede="Lede." aside={<nav aria-label="Order">order</nav>} />);
    expect(screen.getByTestId("section-meta")).toHaveTextContent(/^Source: /);
    expect(screen.getByRole("navigation", { name: "Order" })).toBeInTheDocument();
  });
});
