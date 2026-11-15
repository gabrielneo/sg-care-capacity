import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Prose } from "./Prose";
import { SectionHeading } from "./SectionHeading";

describe("Prose", () => {
  it("is capped at 68 characters, and sized and toned from the scale", () => {
    render(<Prose size="meta" tone="muted" data-testid="p">Note</Prose>);
    const p = screen.getByTestId("p");
    expect(p.className).toContain("max-w-prose");
    expect(p.className).toContain("text-meta");
    expect(p.className).toContain("text-muted");
  });
  it("can be another element", () => {
    render(<Prose as="div" data-testid="d">x</Prose>);
    expect(screen.getByTestId("d").tagName).toBe("DIV");
  });
});

describe("SectionHeading", () => {
  it("puts the lede right after the heading, in the secondary colour", () => {
    render(<SectionHeading id="h" lede="Only one was above usual." ledeTestId="lede">Which hospitals were above usual?</SectionHeading>);
    expect(screen.getByRole("heading", { level: 2, name: "Which hospitals were above usual?" })).toHaveAttribute("id", "h");
    const lede = screen.getByTestId("lede");
    expect(lede).toHaveTextContent("Only one was above usual.");
    expect(lede.className).toContain("text-muted");
    expect(lede.className).toContain("max-w-prose");
  });
  it("has no lede element when there is no sentence", () => {
    const { container } = render(<SectionHeading lede={null}>Heading</SectionHeading>);
    expect(container.querySelector(".lede")).toBeNull();
  });
});
