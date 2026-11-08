import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AreaCollection } from "@/lib/api/types";

vi.mock("@/lib/map3d", async (original) => ({
  ...(await original<typeof import("@/lib/map3d")>()),
  detectCapabilities: () => ({ webgl: true, reducedMotion: false, lowMemory: false }),
}));

const { AccessViews } = await import("./AccessViews");
const AREAS: AreaCollection = { type: "FeatureCollection", features: [] };

describe("AccessViews", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("falls back to the 2D map, saying why, when the data release has no 3D layer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    render(<AccessViews requested="auto" areas={AREAS} clinics={[]} caveats={{}} labels={[]} />);
    await waitFor(() => expect(screen.getByTestId("access-views")).toHaveAttribute("data-view", "2d"));
    expect(screen.getByTestId("view-reason")).toHaveTextContent("This week's data release has no 3D map layer, so the 2D map is shown.");
    expect(fetch).toHaveBeenCalledWith("/access-map/svy21");
  });

  it("asking for 2D never fetches the 3D layer", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<AccessViews requested="2d" areas={AREAS} clinics={[]} caveats={{}} labels={[]} />);
    expect(screen.getByTestId("access-views")).toHaveAttribute("data-view", "2d");
    expect(fetch).not.toHaveBeenCalled();
  });
});
