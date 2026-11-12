import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Hospital, LiveReading } from "@/lib/api/types";
import type { CareRow } from "@/lib/careMapState";
import { type HospitalStatus, levelFor } from "@/lib/status";
import { createScope, setTestScope } from "@/lib/termScope";
import { edMeta } from "@/test/fixtures/meta";

import { ClusterChips, LayoutToggle } from "./CareControls";
import { CareList } from "./CareList";
import { HospitalDrawer } from "./HospitalDrawer";
import { HospitalDrawerBody, sparkSummary } from "./HospitalDrawerBody";

beforeEach(() => setTestScope(createScope()));
afterEach(() => setTestScope(null));

const status = (code: string, pct: number | null, latest: number | null = 5): HospitalStatus => ({
  code, level: levelFor(pct), latest, usual: pct == null ? null : 4, pct, spark: pct == null ? [] : [4, 4, null, 5] });
const hospital = (code: string, over: Partial<Hospital> = {}): Hospital => ({
  hospital_code: code, hospital_name: `${code} Hospital`, cluster: "NUHS", facility_type: "ED", reported_from: null, coverage_note: null,
  exclusions_note: null, source_url: "https://www.moh.gov.sg/", as_of: "2026-11-06", as_of_basis: "reference_checked", ...over } as Hospital);
const live = { hospital_code: "NUH", is_adult_ed: true, est_wait_to_see_doctor_hours: 2, est_wait_to_see_doctor_qualifier: null,
  snapshot_at: "2026-11-06T14:00:00" } as LiveReading;
const body = (st: HospitalStatus, h: Hospital, reading: LiveReading | null = null) =>
  render(<HospitalDrawerBody status={st} hospital={h} live={reading} meta={edMeta} latestWeek="2026-10-19" />);

describe("sparkSummary", () => {
  it("states the range and how many weeks are complete, in words for a screen reader", () => {
    expect(sparkSummary([4, 4, null, 5])).toBe("3 of the last 12 weeks are complete, from 4.0 h to 5.0 h.");
    expect(sparkSummary([4, 4])).toBe("2 of the last 12 weeks are complete, from 4.0 h.");
  });
  it("says so when no week is complete, never a range", () => {
    expect(sparkSummary([])).toBe("No complete week in the last 12.");
    expect(sparkSummary([null, null])).toBe("No complete week in the last 12.");
  });
});

describe("HospitalDrawerBody", () => {
  it("shows the badge, the labelled bed wait against usual, the 12-week line and a link to the trend page", () => {
    body(status("SGH", 25), hospital("SGH", { cluster: "SingHealth" }));
    expect(screen.getByTestId("status-badge")).toHaveTextContent("▲Busier than usual for this hospital");
    expect(screen.getByText("Time waiting for a ward bed after the decision to admit")).toBeInTheDocument();
    expect(screen.getByTestId("drawer-hours")).toHaveTextContent("5.0 h");
    expect(screen.getByTestId("drawer-usual")).toHaveTextContent("Usual: 4.0 h");
    expect(screen.getByTestId("drawer-delta")).toHaveTextContent("▲ 25%+25% vs usual");
    expect(screen.getByTestId("sparkline")).toBeInTheDocument();
    expect(screen.getByTestId("drawer-trend")).toHaveAttribute("href", "/ed-trends?hospital=SGH");
    expect(screen.getByTestId("drawer-cluster")).toHaveTextContent("SingHealth");
  });

  it("has no doctor-wait line without an NUHS estimate, and labels one when there is", () => {
    const { unmount } = body(status("SGH", 25), hospital("SGH"));
    expect(screen.queryByTestId("drawer-live")).toBeNull();
    unmount();
    body(status("NUH", 25), hospital("NUH"), live);
    const line = screen.getByTestId("drawer-live");
    expect(line).toHaveTextContent(/To see a doctor \(.*estimate\): 2 hours/);
    expect(line).toHaveTextContent(/As of .*2026.*An estimate, not live/);
  });

  it("never calls the bed wait a bare 'wait time'", () => {
    body(status("SGH", 25), hospital("SGH"));
    expect(screen.getByTestId("drawer-body").textContent).not.toMatch(/wait time/i);
  });

  it("keeps the coverage caveats: urgent care centre, adults only, exclusions", () => {
    const { unmount } = body(status("AH", null), hospital("AH", { facility_type: "UCC", coverage_note: "An urgent care centre, not a full ED." }));
    expect(screen.getByTestId("drawer-coverage")).toHaveTextContent("Urgent care centre");
    unmount();
    body(status("NUH", 0), hospital("NUH", { coverage_note: "Adults only", exclusions_note: "MOH excludes NUH Children's Emergency." }));
    expect(screen.getByTestId("drawer-coverage")).toHaveTextContent("Adults only");
    expect(screen.getByTestId("drawer-coverage")).toHaveTextContent("excludes");
  });

  it("no comparison: says so, and shows no change figure, never an 'about usual'", () => {
    body(status("AH", null), hospital("AH"));
    expect(screen.getByTestId("status-badge")).toHaveTextContent("No comparison");
    expect(screen.queryByTestId("drawer-delta")).toBeNull();
    expect(screen.getByTestId("drawer-usual")).toHaveTextContent("fewer than 8 complete weeks");
  });

  it("carries the as-of date and the source", () => {
    body(status("SGH", 25), hospital("SGH"));
    expect(screen.getByTestId("provenance-line")).toHaveTextContent(/Data as of/);
    expect(screen.getByTestId("provenance-line")).toHaveTextContent("Source:");
  });
});

const rows: CareRow[] = [
  { code: "SGH", name: "Singapore General Hospital", cluster: "SingHealth", latitude: 1.28, longitude: 103.83, note: null, level: "higher", latest: 5, usual: 4, pct: 25 },
  { code: "AH", name: "Alexandra Hospital (UCC)", cluster: "NUHS", latitude: 1.28, longitude: 103.8, note: "Urgent care centre", level: "unknown", latest: 2, usual: null, pct: null },
];

describe("CareList", () => {
  it("is a table of the same hospitals, with the badge, hours and change", () => {
    render(<CareList rows={rows} sort="usual" onSort={() => {}} onOpen={() => {}} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    const [sgh, ah] = screen.getAllByTestId("care-row");
    expect(within(sgh!).getByTestId("status-badge")).toHaveTextContent("▲Higher than usual");
    expect(within(sgh!).getByTestId("row-hours")).toHaveTextContent("5.0 h");
    expect(within(sgh!).getByTestId("row-delta")).toHaveTextContent("▲ 25%+25%");
    expect(within(sgh!).getByTestId("row-cluster")).toHaveTextContent("SingHealth");
    expect(within(ah!).getByTestId("row-delta")).toHaveTextContent("No comparison");
    expect(within(ah!).getByTestId("row-note")).toHaveTextContent("Urgent care centre");
  });

  it("marks the sorted column with aria-sort and sorts on the header buttons", () => {
    const onSort = vi.fn();
    render(<CareList rows={rows} sort="hours" onSort={onSort} onOpen={() => {}} />);
    const headers = screen.getAllByRole("columnheader");
    expect(headers.find((h) => h.getAttribute("aria-sort") === "descending")).toHaveTextContent("Wait for a ward bed");
    expect(headers.filter((h) => h.getAttribute("aria-sort") === "none").length).toBe(2);
    fireEvent.click(within(screen.getAllByRole("columnheader")[0]!).getByRole("button"));
    expect(onSort).toHaveBeenCalledWith("name");
  });

  it("opens a hospital's details from its name", () => {
    const onOpen = vi.fn();
    render(<CareList rows={rows} sort="usual" onSort={() => {}} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /Singapore General Hospital/ }));
    expect(onOpen).toHaveBeenCalledWith("SGH");
  });
});

describe("controls", () => {
  it("chips: All plus each cluster with its count, the chosen one pressed and ticked", () => {
    const onSelect = vi.fn();
    render(<ClusterChips clusters={["NUHS", "SingHealth"]} counts={{ NUHS: 2, SingHealth: 1 }} selected="NUHS" onSelect={onSelect} />);
    const chips = screen.getAllByTestId("cluster-chip");
    expect(chips.map((c) => c.textContent?.replace(/\s+/g, " ").trim())).toEqual(["All (3)", "✓ NUHS (2)", "SingHealth (1)"]);
    expect(chips.map((c) => c.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
    fireEvent.click(chips[0]!);
    expect(onSelect).toHaveBeenCalledWith(null);
    fireEvent.click(chips[2]!);
    expect(onSelect).toHaveBeenCalledWith("SingHealth");
  });

  it("toggle: the explicit layout is pressed; without one, the screen's default is", () => {
    const { rerender } = render(<LayoutToggle value={null} fallback="list" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /List/ })).toHaveAttribute("aria-pressed", "true");
    rerender(<LayoutToggle value="map" fallback="list" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /Map/ })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("HospitalDrawer", () => {
  // jsdom has no <dialog> methods: stand in for them, as far as the component uses them.
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  });

  it("opens for a code with its title and content, and Close calls onClose", () => {
    const onClose = vi.fn();
    render(<HospitalDrawer code="SGH" title="Singapore General Hospital" onClose={onClose}><p>details</p></HospitalDrawer>);
    const dialog = screen.getByTestId("hospital-drawer");
    expect(dialog).toHaveAttribute("open");
    expect(within(dialog).getByRole("heading", { name: "Singapore General Hospital" })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("drawer-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("is closed, and empty, without a code", () => {
    render(<HospitalDrawer code={null} title="" onClose={() => {}}><p>details</p></HospitalDrawer>);
    expect(screen.getByTestId("hospital-drawer")).not.toHaveAttribute("open");
    expect(screen.queryByText("details")).toBeNull();
  });
});
