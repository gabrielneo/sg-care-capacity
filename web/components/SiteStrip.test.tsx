import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StripData } from "@/lib/strip";

import { SiteStrip, stripLead } from "./SiteStrip";

const strip: StripData = {
  total: 8, above: 1, noComparison: 0, week: "19–25 Oct 2026",
  bed: { source: "MOH", asOf: "2026-10-31" },
  pills: [
    { id: "bed", dataset: "Bed waits", source: "MOH", level: "due", label: "Due an update", detail: "weekly · as of 31 Oct 2026 · 12 days old", asOf: "2026-10-31" },
    { id: "doctor", dataset: "Time-to-see-a-doctor estimates", source: "NUHS", level: "up_to_date", label: "Up to date", detail: "some hospitals only · updated 11 Nov 2026, 12:01 pm SGT", asOf: "2026-11-11T12:01:49" },
  ],
};
const targets = [{ id: "summary", label: "Summary", href: "#section-summary" }, { id: "hospitals", label: "Hospitals", href: "#section-hospitals" }];

/** A stand-in for IntersectionObserver that lets a test say whether the intro has scrolled away. */
let observe: ((past: boolean) => void) | null = null;
beforeEach(() => {
  document.body.insertAdjacentHTML("afterbegin", '<div data-strip-sentinel=""></div>');
  vi.stubGlobal("IntersectionObserver", class {
    constructor(cb: (e: Partial<IntersectionObserverEntry>[]) => void) {
      observe = (past) => cb([{ isIntersecting: !past, boundingClientRect: { bottom: past ? -10 : 80 } as DOMRectReadOnly }]);
    }
    observe() {} disconnect() {}
  });
});
afterEach(() => { document.querySelector("[data-strip-sentinel]")?.remove(); vi.unstubAllGlobals(); });

const scrollPast = (past: boolean) => act(() => observe!(past));

describe("SiteStrip", () => {
  it("says how many EDs are higher than usual and which week, as plain text (not a link)", () => {
    expect(stripLead(strip)).toBe("1 of 8 emergency departments higher than usual · week of 19–25 Oct 2026");
    render(<SiteStrip strip={strip} targets={targets} />);
    expect(screen.getByTestId("strip-summary")).toHaveTextContent("1 of 8 emergency departments higher than usual");
    expect(screen.getByTestId("strip-summary").querySelector("a")).toBeNull();
    // The language rules: never "busier".
    expect(screen.getByTestId("site-strip")).not.toHaveTextContent(/busy|busier/i);
  });

  it("says so, never a zero, when no hospital has a usual level yet", () => {
    expect(stripLead({ ...strip, total: 2, above: 0, noComparison: 2 })).toBe("No comparison with usual yet · week of 19–25 Oct 2026");
  });

  it("is out of sight until the intro has scrolled away, and hides again when it is back", () => {
    render(<SiteStrip strip={strip} targets={targets} />);
    const bar = screen.getByTestId("site-strip");
    expect(bar).toHaveAttribute("data-shown", "false");
    expect(bar.className).not.toContain("md:block");
    scrollPast(true);
    expect(bar).toHaveAttribute("data-shown", "true");
    // Never on a phone: the class that shows it starts at 768px.
    expect(bar.className).toContain("hidden md:block");
    scrollPast(false);
    expect(bar).toHaveAttribute("data-shown", "false");
  });

  it("shows the bed-wait data's freshness in a symbol and words, and opens each dataset's own date", () => {
    render(<SiteStrip strip={strip} targets={targets} />);
    scrollPast(true);
    const fresh = screen.getByTestId("strip-freshness");
    expect(fresh).toHaveTextContent(/^!MOH data: Due an update/);
    expect(fresh).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(fresh);
    expect(fresh).toHaveAttribute("aria-expanded", "true");
    const pills = screen.getAllByTestId("strip-pill");
    expect(pills[0]).toHaveTextContent("Bed waits · MOH · weekly · as of 31 Oct 2026 · 12 days old");
    expect(pills[1]).toHaveTextContent("Time-to-see-a-doctor estimates · NUHS · some hospitals only · updated 11 Nov 2026, 12:01 pm SGT");
  });

  it("opens the section list, jumps with plain anchors, and closes with Esc, returning focus", () => {
    render(<SiteStrip strip={strip} targets={targets} />);
    scrollPast(true);
    const jump = screen.getByTestId("strip-jump");
    expect(jump).toHaveTextContent("Jump to section");
    expect(screen.getByTestId("strip-jump-list")).not.toBeVisible();
    fireEvent.click(jump);
    expect(jump).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Hospitals" })).toHaveAttribute("href", "#section-hospitals");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(jump).toHaveAttribute("aria-expanded", "false");
    expect(jump).toHaveFocus();
  });

  it("has no tooltip-only content and no cluster filter", () => {
    render(<SiteStrip strip={strip} targets={targets} />);
    expect(screen.getByTestId("site-strip").querySelector("[title]")).toBeNull();
    expect(screen.queryByRole("group", { name: "Show hospitals from" })).toBeNull();
  });
});
