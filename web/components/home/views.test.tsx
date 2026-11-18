import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createScope, setTestScope } from "@/lib/termScope";

import { HomeNotice } from "./HomeHero";
import { MethodsDrawer } from "./MethodsDrawer";

beforeEach(() => setTestScope(createScope()));
afterEach(() => setTestScope(null));

describe("HomeNotice", () => {
  it("has one page heading, what the site is for and 'not medical advice', and no 995 banner (the footer has the number)", () => {
    render(<HomeNotice />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByTestId("emergency-note")).toBeNull();
    expect(screen.getByTestId("not-advice")).toHaveTextContent("isn't medical advice");
    expect(screen.getByTestId("site-purpose")).toBeInTheDocument();
  });
});

describe("MethodsDrawer", () => {
  it("is closed unless opened, and lists no statistics without findings", () => {
    const { unmount } = render(<MethodsDrawer findings={[]} limits={<p>Limits</p>} />);
    expect(screen.getByTestId("methods-drawer")).not.toHaveAttribute("open");
    expect(screen.queryByTestId("methods-findings")).toBeNull();
    unmount();
    setTestScope(createScope());
    render(<MethodsDrawer findings={[]} limits={<p>Limits</p>} open />);
    expect(screen.getByTestId("methods-drawer")).toHaveAttribute("open");
  });
});
