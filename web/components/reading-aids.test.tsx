import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Insight } from "@/lib/api/types";
import { changesLede } from "@/lib/ledes";
import { createScope, setTestScope } from "@/lib/termScope";
import { edMeta } from "@/test/fixtures/meta";

import { MethodsDrawer } from "./home/MethodsDrawer";
import { Takeaways } from "./home/Takeaways";
import { WhatChanged } from "./home/WhatChanged";
import { JumpMenu } from "./JumpMenu";
import { MobileAccordion } from "./MobileAccordion";
import { OnThisPage } from "./OnThisPage";

beforeEach(() => setTestScope(createScope()));
afterEach(() => { setTestScope(null); vi.unstubAllGlobals(); window.location.hash = ""; });

describe("the calm zero state", () => {
  it("says no ED had a longer bed wait when no badge moved and none is higher", () => {
    expect(changesLede(0, 8, 0)).toBe("No emergency department had a longer bed wait than usual in the latest complete week.");
  });
  it("keeps the old sentence when something is higher, or when nothing was compared", () => {
    expect(changesLede(0, 8, 2)).toBe("No hospital changed its badge since the week before.");
    expect(changesLede(0, 8, null)).toBe("No hospital changed its badge since the week before.");
    expect(changesLede(1, 7, 0)).toMatch(/^1 of 8 hospitals changed badge/);
  });
  it("never uses the words the language rules ban for the bed wait", () => {
    expect(changesLede(0, 8, 0)).not.toMatch(/busy|busier|quiet/i);
  });
  it("renders as the section's lede, not an empty card", () => {
    render(<WhatChanged changes={{ previousWeek: "2026-10-12", moved: [], unchanged: 8, notCompared: 0 }} names={{}} meta={edMeta}
                        latestWeek={{ week_start: "2026-10-19", week_end: "2026-10-25" }} higher={0} />);
    expect(screen.getByTestId("changes-none")).toHaveTextContent("No emergency department had a longer bed wait than usual");
  });
});

describe("Takeaways densities", () => {
  const item = { id: "i1", entity: "SGH", isHospital: false, title: "Tuesdays: 43% above average", numbers: null, headline: "h", sourceIds: [], dqTables: [] };
  it("planner: links to the Analyst view and shows no evidence", () => {
    render(<Takeaways items={[item]} meta={edMeta} density="simple" evidence={{ i1: { level: "Tested", sample: "n = 5" } }} />);
    expect(screen.getByTestId("to-analyst")).toHaveAttribute("href", "/find?view=analyst#section-takeaways");
    expect(screen.queryByTestId("takeaway-evidence")).toBeNull();
  });
  it("analyst: shows evidence level and n, and no link to itself", () => {
    render(<Takeaways items={[item]} meta={edMeta} density="full" evidence={{ i1: { level: "Tested", sample: "n = 182 days" } }} />);
    expect(screen.getByTestId("takeaway-evidence")).toHaveTextContent("Evidence: Tested · n = 182 days");
    expect(screen.queryByTestId("to-analyst")).toBeNull();
  });
});

describe("MethodsDrawer by audience (audit G1)", () => {
  it("the clinic definition is on Public only", () => {
    const { unmount } = render(<MethodsDrawer findings={[]} limits={null} audience="public" />);
    expect(screen.getByText("About these numbers")).toBeInTheDocument();
    expect(screen.getByText("Clinics near you")).toBeInTheDocument();
    expect(screen.queryByTestId("analyst-links")).toBeNull();
    unmount();
    render(<MethodsDrawer findings={[] as Insight[]} limits={null} audience="analyst" open />);
    expect(screen.getByText("How these figures are made")).toBeInTheDocument();
    expect(screen.queryByText("Clinics near you")).toBeNull();
    expect(within(screen.getByTestId("analyst-links")).getAllByRole("link")).toHaveLength(4);
  });
});

describe("JumpMenu", () => {
  it("lists the sections as in-page links", () => {
    render(<JumpMenu items={[{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }]} />);
    expect(screen.getByRole("link", { name: "Beta" })).toHaveAttribute("href", "#b");
  });
  it("renders nothing without items", () => {
    const { container } = render(<JumpMenu items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("OnThisPage scroll-spy", () => {
  it("marks the first listed section that is in view, with aria-current", () => {
    let callback: IntersectionObserverCallback = () => {};
    vi.stubGlobal("IntersectionObserver", class { constructor(cb: IntersectionObserverCallback) { callback = cb; } observe() {} disconnect() {} });
    document.body.insertAdjacentHTML("beforeend", '<div id="s1"></div><div id="s2"></div>');
    render(<OnThisPage items={[{ id: "s1", label: "One" }, { id: "s2", label: "Two" }]} />);
    expect(screen.getByRole("link", { name: "One" })).toHaveAttribute("aria-current", "location");
    act(() => callback([{ isIntersecting: true, target: document.getElementById("s2")! } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(screen.getByRole("link", { name: "Two" })).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("link", { name: "One" })).not.toHaveAttribute("aria-current");
  });
});

describe("MobileAccordion", () => {
  const stubWidth = (narrow: boolean) => vi.stubGlobal("matchMedia", (q: string) => ({ matches: narrow, media: q, addEventListener() {}, removeEventListener() {} }));

  it("from 768px it is just the content, with no disclosure", () => {
    stubWidth(false);
    render(<MobileAccordion anchor="section-x" label="Show x"><p>Body</p></MobileAccordion>);
    expect(screen.queryByTestId("accordion-section-x")).toBeNull();
    expect(screen.getByText("Body")).toBeVisible();
  });

  it("below 768px it is closed, opens from the fragment, and writes the fragment when toggled", () => {
    stubWidth(true);
    render(<MobileAccordion anchor="section-x" label="Show x"><p>Body</p></MobileAccordion>);
    const d = screen.getByTestId("accordion-section-x") as HTMLDetailsElement;
    expect(d.open).toBe(false);
    d.open = true; fireEvent(d, new Event("toggle"));
    expect(window.location.hash).toBe("#section-x");
    d.open = false; fireEvent(d, new Event("toggle"));
    expect(window.location.hash).toBe("");
  });

  it("opens when the page is reached with its fragment", () => {
    stubWidth(true);
    window.location.hash = "#section-x";
    render(<MobileAccordion anchor="section-x" label="Show x"><p>Body</p></MobileAccordion>);
    expect((screen.getByTestId("accordion-section-x") as HTMLDetailsElement).open).toBe(true);
  });
});
