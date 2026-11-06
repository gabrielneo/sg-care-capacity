import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { isCurrent } from "@/lib/nav";

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

import { Nav } from "./Nav";

describe("Nav", () => {
  it("lists the six sections in order", () => {
    render(<Nav />);
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Overview", "ED Trends", "Access Map", "Data Quality", "Methodology", "Case Study"]);
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });

  it("marks the current page for assistive tech", () => {
    pathname.value = "/access-map";
    render(<Nav />);
    expect(screen.getByRole("link", { name: "Access Map" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("only marks Overview on the home page", () => {
    expect(isCurrent("/", "/")).toBe(true);
    expect(isCurrent("/ed-trends", "/")).toBe(false);
    expect(isCurrent("/ed-trends/sgh", "/ed-trends")).toBe(true);
    expect(isCurrent("/ed-trendsx", "/ed-trends")).toBe(false);
  });
});
