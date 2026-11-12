import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StripData } from "@/lib/strip";

import { SiteStrip } from "./SiteStrip";

const strip: StripData = {
  total: 9, above: 3, noComparison: 0, week: "19–25 Oct 2026",
  bed: { source: "MOH", asOf: "2026-10-31" },
  pills: [
    { id: "bed", dataset: "Bed waits", source: "MOH", level: "amber", label: "Due an update", detail: "weekly · as of 31 Oct 2026 · 12 days old", asOf: "2026-10-31" },
    { id: "doctor", dataset: "Doctor-wait estimates", source: "NUHS", level: "green", label: "Up to date", detail: "some hospitals only · updated 11 Nov 2026, 12:01 pm SGT", asOf: "2026-11-11T12:01:49" },
  ],
};

const serve = (body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => body })));

beforeEach(() => window.history.replaceState(null, "", "/"));

describe("SiteStrip", () => {
  it("shows the count, the week and a link to the Planner view", async () => {
    serve({ ok: true, strip });
    render(<SiteStrip />);
    const link = await screen.findByTestId("strip-summary");
    expect(link).toHaveTextContent("3 of 9 hospitals busier than usual");
    expect(link).toHaveTextContent("week of 19–25 Oct 2026");   // shown from 1280px, where the pills have the source and date
    expect(link).toHaveAttribute("href", "/?view=planner");
  });

  it("says the count's source and as-of date in words, not only in a tooltip", async () => {
    serve({ ok: true, strip });
    render(<SiteStrip />);
    expect(await screen.findByTestId("strip-basis")).toHaveTextContent("MOH, data as of 31 Oct 2026");
    expect(screen.getByTestId("site-strip").querySelector("[title]")).toBeNull();
  });

  it("gives each dataset its own pill, with a symbol and words, not colour alone", async () => {
    serve({ ok: true, strip });
    render(<SiteStrip />);
    const pills = await screen.findAllByTestId("strip-pill");
    expect(pills[0]).toHaveTextContent("! Due an update");
    expect(pills[0]).toHaveTextContent("Bed waits · MOH · weekly · as of 31 Oct 2026 · 12 days old");
    expect(pills[1]).toHaveTextContent("✓ Up to date");
    expect(pills[1]).toHaveTextContent("Doctor-wait estimates · NUHS · some hospitals only · updated 11 Nov 2026, 12:01 pm SGT");
  });

  it("opens and closes the details with aria-expanded", async () => {
    serve({ ok: true, strip });
    render(<SiteStrip />);
    const button = await screen.findByTestId("strip-details");
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(button.getAttribute("aria-controls")!)).toBe(screen.getByTestId("strip-panel"));
  });

  it("has no cluster filter: that lives with the hospital map", async () => {
    serve({ ok: true, strip });
    render(<SiteStrip />);
    await screen.findByTestId("strip-summary");
    expect(screen.queryByRole("group", { name: "Show hospitals from" })).toBeNull();
  });

  it("says so when the data is unavailable, and invents nothing", async () => {
    serve({ ok: false });
    render(<SiteStrip />);
    await waitFor(() => expect(screen.getByTestId("site-strip")).toHaveTextContent("Data status is not available right now."));
    expect(screen.queryByTestId("strip-pill")).toBeNull();
  });
});
