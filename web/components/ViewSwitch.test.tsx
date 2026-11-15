import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/", push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: nav.push }) }));

import { ViewSwitch } from "./ViewSwitch";

const at = (search: string) => window.history.replaceState(null, "", `/${search ? `?${search}` : ""}`);

beforeEach(() => {
  at("");
  nav.pathname = "/";
  nav.push.mockClear();
});

describe("ViewSwitch", () => {
  it("is a radio group of the three views (Public, Planner, Analyst), with the given view checked", () => {
    render(<ViewSwitch view="public" />);
    const group = screen.getByRole("radiogroup", { name: "View" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(["public", "planner", "analyst"]);
    expect(radios.map((r) => (r as HTMLInputElement).labels?.[0]?.textContent?.replace("✓", "").trim())).toEqual(["Public", "Planner", "Analyst"]);
    expect(within(group).getByRole("radio", { name: "Public" })).toBeChecked();
    expect(within(group).getByRole("radio", { name: "Planner" })).not.toBeChecked();
    // One name, so the browser treats them as one group: Tab enters once, arrow keys move.
    expect(new Set(radios.map((r) => (r as HTMLInputElement).name))).toEqual(new Set(["view"]));
    expect(screen.getByTestId("view-switch")).toHaveAttribute("data-view", "public");
  });

  it("is a 36px control from 768px, hidden below it; the sheet's copy is a column of rows with no hiding", () => {
    const { rerender } = render(<ViewSwitch view="analyst" />);
    expect(screen.getByTestId("view-switch").className).toContain("hidden md:block");
    expect(screen.getByTestId("view-radios").className).toContain("control-h");
    rerender(<ViewSwitch view="analyst" placement="sheet" />);
    expect(screen.getByTestId("view-switch-sheet").className).not.toContain("hidden");
    expect(screen.getByTestId("view-radios-sheet").className).toContain("flex-col");
    expect(screen.getByRole("radio", { name: "Analyst" })).toBeChecked();
  });

  it("shows the selected segment with a tick as well as colour", () => {
    render(<ViewSwitch view="planner" />);
    expect((screen.getByRole("radio", { name: "Planner" }) as HTMLInputElement).labels?.[0]).toHaveTextContent("✓");
    expect((screen.getByRole("radio", { name: "Public" }) as HTMLInputElement).labels?.[0]).not.toHaveTextContent("✓");
  });

  it("puts the choice in the URL", () => {
    render(<ViewSwitch view="public" />);
    fireEvent.click(screen.getByRole("radio", { name: "Planner" }));
    expect(nav.push).toHaveBeenCalledWith("/?view=planner", { scroll: false });
  });

  it("goes back to the plain address for Public, and keeps other query parameters", () => {
    at("view=planner&sort=name");
    render(<ViewSwitch view="planner" />);
    fireEvent.click(screen.getByRole("radio", { name: "Public" }));
    expect(nav.push).toHaveBeenCalledWith("/?sort=name", { scroll: false });
  });

  it("does nothing when the current view is chosen again", () => {
    render(<ViewSwitch view="planner" />);
    fireEvent.click(screen.getByRole("radio", { name: "Planner" }));
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("is only on the home page, even if the header slot still holds it", () => {
    nav.pathname = "/ed-trends";
    const { container } = render(<ViewSwitch view="planner" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("without JavaScript, the form sends the view and nothing else (the clinic search is never in the address)", () => {
    const { container } = render(<ViewSwitch view="public" />);
    const forms = [...container.querySelectorAll("form")];
    expect(forms).toHaveLength(1);
    expect(forms[0]).toHaveAttribute("method", "get");
    expect(forms[0]!.getAttribute("action")).toBe("/");
    expect(new FormData(forms[0]!).has("near")).toBe(false);
    expect(new FormData(forms[0]!).get("view")).toBe("public");
  });
});
