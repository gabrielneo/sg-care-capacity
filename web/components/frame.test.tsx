import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { sectionAnchor } from "@/lib/homeViews";
import { NOTICE_995_LINE, Notice995 } from "@/components/Notice995";
import { SITE } from "@/lib/site";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }) }));
vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
vi.mock("@/components/DataStatus", () => ({ DataStatus: () => null }));

import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

describe("Notice995", () => {
  it("is one sentence, and 995 is a tel: link with a 44px target", () => {
    render(<Notice995 variant="footer" />);
    const note = screen.getByTestId("footer-notice");
    expect(note).toHaveTextContent(`✚ Emergency? Call 995. ${NOTICE_995_LINE}`);
    expect(within(note).getByRole("link", { name: "Call 995" })).toHaveAttribute("href", "tel:995");
    expect(NOTICE_995_LINE).toBe("This site shows public statistics, not medical advice.");
  });
});

describe("SiteFooter", () => {
  it("has three columns of at most six links, with the 995 line, the glossary and the project's links", () => {
    render(<SiteFooter />);
    const columns = screen.getAllByTestId("footer-column");
    expect(columns.map((c) => c.querySelector("[data-footer-title]")?.textContent)).toEqual(["Data and privacy", "About this project", "Help"]);
    for (const c of columns) expect(within(c).getAllByRole("link").length).toBeLessThanOrEqual(6);
    const about = within(columns[1]!);
    expect(about.getAllByRole("link").map((a) => a.textContent?.replace(/\s*\(opens in a new tab\)/, ""))).toEqual(["The project in 60 seconds", "Case study", "GitHub", "CV"]);
    expect(about.getByRole("link", { name: /60 seconds/ })).toHaveAttribute("href", "/project");
    const help = within(columns[2]!);
    expect(help.getByTestId("footer-notice")).toHaveTextContent(NOTICE_995_LINE);
    expect(help.getByRole("link", { name: "Glossary" })).toHaveAttribute("href", "/glossary");
    expect(within(columns[0]!).getByText(/No personal or patient-level data/)).toBeInTheDocument();
    expect(screen.queryAllByRole("heading")).toHaveLength(0);   // a footer adds nothing to the page's outline
    expect(screen.getByTestId("footer-credits")).toHaveTextContent(/^Built by Gabriel Neo,/);
    expect(screen.getByTestId("site-footer").className).toContain("bg-band");
  });
});

describe("SiteHeader", () => {
  it("has the serif wordmark, the tagline, five sections and a Menu button", () => {
    render(<SiteHeader />);
    const mark = screen.getByTestId("wordmark");
    expect(mark).toHaveTextContent(`${SITE.name}${SITE.tagline}`);
    expect(mark.querySelector(".font-serif")).not.toBeNull();
    expect(screen.getByRole("navigation", { name: "Main" }).querySelectorAll("a")).toHaveLength(5);
    expect(screen.getByTestId("menu-button")).toHaveTextContent("Menu");
    expect(screen.getByTestId("site-header").className).toContain("bg-page");
    expect(screen.getByTestId("site-header").className).toContain("header-h");
  });
});

describe("the finder's sections", () => {
  it("each has an anchor a link can jump to (the Planner and Analyst views were removed on 18 Nov 2026)", () => {
    expect(sectionAnchor("finder")).toBe("section-finder");
    expect(sectionAnchor("ednear")).toBe("section-ednear");
  });
});
