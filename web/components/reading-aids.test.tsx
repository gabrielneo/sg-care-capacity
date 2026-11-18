import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Insight } from "@/lib/api/types";
import { createScope, setTestScope } from "@/lib/termScope";

import { MethodsDrawer } from "./home/MethodsDrawer";
import { JumpMenu } from "./JumpMenu";
import { OnThisPage } from "./OnThisPage";

beforeEach(() => setTestScope(createScope()));
afterEach(() => { setTestScope(null); vi.unstubAllGlobals(); window.location.hash = ""; });

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

