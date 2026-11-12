import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { isCurrent } from "@/lib/nav";

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

import { Nav } from "./Nav";

describe("Nav", () => {
  it("lists the sections in order", () => {
    render(<Nav />);
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Home", "The project", "Findings", "Explore", "How it's built", "Case Study"]);
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });

  it("marks the current page for assistive tech", () => {
    pathname.value = "/access-map";
    render(<Nav />);
    expect(screen.getByRole("link", { name: "Explore" })).toHaveAttribute("aria-current", "page");   // a page under Explore
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("only marks Home on the home page", () => {
    expect(isCurrent("/", "/")).toBe(true);
    expect(isCurrent("/ed-trends", "/")).toBe(false);
    expect(isCurrent("/ed-trends/sgh", "/ed-trends")).toBe(true);
    expect(isCurrent("/ed-trendsx", "/ed-trends")).toBe(false);
    expect(isCurrent("/data-quality", "/how-its-built", ["/data-quality", "/methodology"])).toBe(true);
    expect(isCurrent("/data-qualityx", "/how-its-built", ["/data-quality"])).toBe(false);
  });
});
