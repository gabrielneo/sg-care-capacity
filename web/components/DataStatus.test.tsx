import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataStatusLine } from "./DataStatus";

describe("DataStatusLine", () => {
  it("names the release, its date and links to it", () => {
    render(<DataStatusLine status={{ ok: true, asOf: "2026-11-08T17:44:14",
      info: { snapshot_id: "data-2026-11-08", release_url: "https://github.com/o/r/releases/tag/data-2026-11-08" } }} />);
    expect(screen.getByTestId("data-status")).toHaveTextContent("Data release data-2026-11-08, as of 8 Nov 2026 · View the release");
    expect(screen.getByRole("link", { name: "View the release" }))
      .toHaveAttribute("href", "https://github.com/o/r/releases/tag/data-2026-11-08");
  });

  it("has no link for a local snapshot", () => {
    render(<DataStatusLine status={{ ok: true, asOf: "2026-11-08", info: { snapshot_id: "data-2026-11-08", release_url: null } }} />);
    expect(screen.getByTestId("data-status")).toHaveTextContent("Data release data-2026-11-08, as of 8 Nov 2026");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("says so plainly when the API can't be reached", () => {
    render(<DataStatusLine status={{ ok: false }} />);
    expect(screen.getByTestId("data-status")).toHaveTextContent("Data release: not available right now.");
  });
});
