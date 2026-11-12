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
  it("is a radio group of the three views, with the given view checked", () => {
    render(<ViewSwitch view="public" />);
    const group = screen.getByRole("radiogroup", { name: "View" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(["public", "planner", "analyst"]);
    expect(within(group).getByRole("radio", { name: "Public" })).toBeChecked();
    expect(within(group).getByRole("radio", { name: "Planner summary" })).not.toBeChecked();
    // One name, so the browser treats them as one group: Tab enters once, arrow keys move.
    expect(new Set(radios.map((r) => (r as HTMLInputElement).name))).toEqual(new Set(["view"]));
  });

  it("offers the same choice as a labelled select for narrow screens", () => {
    render(<ViewSwitch view="analyst" />);
    const select = screen.getByRole("combobox", { name: "View" });
    expect(select).toHaveValue("analyst");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Public", "Planner summary", "Analyst detail"]);
    expect(screen.getByRole("radio", { name: "Analyst detail" })).toBeChecked();
    expect(screen.getByTestId("view-switch")).toHaveAttribute("data-view", "analyst");
  });

  it("puts the choice in the URL", () => {
    render(<ViewSwitch view="public" />);
    fireEvent.click(screen.getByRole("radio", { name: "Planner summary" }));
    expect(nav.push).toHaveBeenCalledWith("/?view=planner", { scroll: false });
  });

  it("goes back to the plain address for Public, from the select too", () => {
    at("view=planner");
    render(<ViewSwitch view="planner" />);
    fireEvent.change(screen.getByTestId("view-select"), { target: { value: "public" } });
    expect(nav.push).toHaveBeenCalledWith("/", { scroll: false });
  });

  it("does nothing when the current view is chosen again", () => {
    render(<ViewSwitch view="planner" />);
    fireEvent.change(screen.getByTestId("view-select"), { target: { value: "planner" } });
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("is only on the home page, even if the header slot still holds it", () => {
    nav.pathname = "/ed-trends";
    const { container } = render(<ViewSwitch view="planner" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("without JavaScript, each form sends the view and nothing else (the clinic search is never in the address)", () => {
    const { container } = render(<ViewSwitch view="public" />);
    const forms = [...container.querySelectorAll("form")];
    expect(forms).toHaveLength(2);
    for (const form of forms) {
      expect(form).toHaveAttribute("method", "get");
      expect(form.getAttribute("action")).toBe("/");
      expect(new FormData(form).has("near")).toBe(false);
      expect(new FormData(form).get("view")).toBe("public");
    }
  });
});
