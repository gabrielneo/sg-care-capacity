import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataStatusLine, toStatus } from "./DataStatus";

describe("DataStatusLine", () => {
  it("names the release, its date and links to it", () => {
    render(<DataStatusLine status={{ ok: true, asOf: "2026-11-08T17:44:14",
      info: { snapshot_id: "data-2026-11-08", release_url: "https://github.com/o/r/releases/tag/data-2026-11-08" } }} />);
    expect(screen.getByTestId("data-status")).toHaveTextContent("Data release data-2026-11-08, as of 8 Nov 2026 · View the release");
    expect(screen.getByRole("link", { name: "View the release" }))
      .toHaveAttribute("href", "https://github.com/o/r/releases/tag/data-2026-11-08");
  });

  it("says when the next weekly check is and that the sources lag", () => {
    render(<DataStatusLine now={new Date("2026-11-14T10:00:00+08:00")} status={{ ok: true, asOf: "2026-11-08T17:44:14",
      info: { snapshot_id: "data-2026-11-08", release_url: null } }} />);
    expect(screen.getByTestId("data-cadence")).toHaveTextContent("Checked weekly on Sundays. Next check Sun, 15 Nov.");
    expect(screen.getByTestId("data-cadence")).toHaveTextContent("The sources publish with a lag");
  });

  it("says plainly when the scheduled check hasn't produced a newer release", () => {
    render(<DataStatusLine now={new Date("2026-11-17T09:00:00+08:00")} status={{ ok: true, asOf: "2026-11-08", info: { snapshot_id: "data-2026-11-08", release_url: null } }} />);
    expect(screen.getByTestId("data-cadence")).toHaveTextContent("hasn't produced a newer release yet");
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

describe("toStatus", () => {
  it("reads /status.json's body, and treats anything incomplete as unavailable", () => {
    expect(toStatus({ ok: true, snapshot_id: "data-2026-11-08", release_url: null, as_of: "2026-11-08T22:31:13" }))
      .toEqual({ ok: true, info: { snapshot_id: "data-2026-11-08", release_url: null }, asOf: "2026-11-08T22:31:13" });
    expect(toStatus({ ok: false })).toEqual({ ok: false });
    expect(toStatus({ ok: true })).toEqual({ ok: false });
  });
});
