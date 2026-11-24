import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FreshnessBadge, LEVEL_STYLE, LEVEL_SYMBOL } from "@/components/FreshnessBadge";
import { Missing } from "@/components/Missing";

import { LocationSource } from "./LocationSource";

describe("LocationSource (audit L3)", () => {
  const pin = { latitude: 1.3, location_checked: "2026-11-09", location_source_url: "https://www.onemap.gov.sg/api/common/elastic/search" };

  it("names the source and the date the pins were checked", () => {
    render(<LocationSource hospitals={[pin, { ...pin, location_checked: "2026-11-01" }]} />);
    const line = screen.getByTestId("location-source");
    expect(line).toHaveTextContent("Hospital locations: map pins from OneMap (Singapore Land Authority), checked 9 Nov 2026.");
    expect(line.querySelector("a")).toBeNull();          // OneMap allows links to its home page only (lib/sourceLinks.ts)
  });

  it("says nothing when a release has no pins: missing stays missing", () => {
    const { container } = render(<LocationSource hospitals={[{ latitude: null, location_checked: null, location_source_url: null }]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Missing (audit L4)", () => {
  it("shows a dash to the eye and words to a screen reader", () => {
    render(<p data-testid="p"><Missing /></p>);
    expect(screen.getByTestId("p")).toHaveTextContent("–no complete week");
    expect(screen.getByText("–")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("FreshnessBadge looks different from a status badge (audit L5)", () => {
  it("never uses a status colour, and each level has its own symbol", () => {
    for (const style of Object.values(LEVEL_STYLE)) expect(style).not.toMatch(/status-|danger/);
    expect(new Set(Object.values(LEVEL_SYMBOL)).size).toBe(4);
    for (const symbol of Object.values(LEVEL_SYMBOL)) expect(["▲▲", "▲", "▬", "▼"]).not.toContain(symbol);
  });

  it("is square-cornered, where the status badge is a pill", () => {
    render(<FreshnessBadge freshness={{ level: "overdue", cadence: "weekly", label: "Overdue", age: "20 days", sourceId: "moh_bed_waits" } as never} />);
    expect(screen.getByTestId("freshness-badge").className).toMatch(/rounded-sm/);
    expect(screen.getByTestId("freshness-badge").className).not.toMatch(/rounded-full/);
  });
});
