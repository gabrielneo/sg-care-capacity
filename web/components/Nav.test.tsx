import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { isCurrent } from "@/lib/nav";

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

import { Nav } from "./Nav";

describe("Nav", () => {
  it("lists five sections in order", () => {
    render(<Nav />);
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["Home", "Findings", "Explore", "Methods", "About"]);
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });

  it("marks the current page for assistive tech, with royal-blue text and an underline (no filled pill)", () => {
    pathname.value = "/access-map";
    render(<Nav />);
    const explore = screen.getByRole("link", { name: "Explore" });
    expect(explore).toHaveAttribute("aria-current", "page");   // a page under Explore
    expect(explore.className).toContain("border-primary");
    expect(explore.className).toContain("text-primary-text");
    expect(explore.className).not.toContain("bg-");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("puts the project, how it's built and the case study under About; the checks and methods under Methods", () => {
    for (const [path, label] of [["/project", "About"], ["/how-its-built", "About"], ["/case-study", "About"], ["/about", "About"],
      ["/methodology", "Methods"], ["/data-quality", "Methods"], ["/glossary", "Methods"], ["/docs/insights-method", "Methods"]] as const) {
      pathname.value = path;
      const { unmount } = render(<Nav />);
      expect(screen.getAllByRole("link", { current: "page" }).map((a) => a.textContent), path).toEqual([label]);
      unmount();
    }
  });

  it("is a column of rows in the menu sheet, and tells the sheet when a link is followed", () => {
    pathname.value = "/findings";
    const followed = vi.fn();
    render(<Nav variant="sheet" onNavigate={followed} />);
    expect(screen.getByRole("navigation", { name: "Menu" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: /Explore/ }));
    expect(followed).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: /Findings.*current page/ })).toHaveAttribute("aria-current", "page");
  });

  it("only marks Home on the home page", () => {
    expect(isCurrent("/", "/")).toBe(true);
    expect(isCurrent("/ed-trends", "/")).toBe(false);
    expect(isCurrent("/ed-trends/sgh", "/ed-trends")).toBe(true);
    expect(isCurrent("/ed-trendsx", "/ed-trends")).toBe(false);
    expect(isCurrent("/data-quality", "/methodology", ["/data-quality", "/glossary"])).toBe(true);
    expect(isCurrent("/data-qualityx", "/methodology", ["/data-quality"])).toBe(false);
  });
});
