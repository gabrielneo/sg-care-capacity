import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Hospital, LiveReading } from "@/lib/api/types";
import { type HospitalStatus, levelFor } from "@/lib/status";
import { createScope, setTestScope } from "@/lib/termScope";
import { edMeta } from "@/test/fixtures/meta";

import { HomeNotice } from "./HomeHero";
import { MethodsDrawer } from "./MethodsDrawer";
import { StatusCard } from "./StatusCard";
import { StatusGrid } from "./StatusGrid";
import { SummaryStrip } from "./SummaryStrip";

const status = (code: string, pct: number | null, latest: number | null = 5): HospitalStatus => ({
  code, level: levelFor(pct), latest, usual: pct == null ? null : 4, pct, spark: pct == null ? [] : [4, 4, null, 5] });
const hospital = (code: string, over: Partial<Hospital> = {}): Hospital => ({
  hospital_code: code, hospital_name: code, cluster: "NUHS", facility_type: "ED", reported_from: null, coverage_note: null,
  exclusions_note: "MOH excludes KK Women's and Children's Hospital and NUH Children's Emergency from these statistics.",
  source_url: "https://www.moh.gov.sg/", as_of: "2026-11-06", as_of_basis: "reference_checked", ...over } as Hospital);
const live = { hospital_code: "SGH", is_adult_ed: true, est_wait_to_see_doctor_hours: 1, est_wait_to_see_doctor_qualifier: "<",
  snapshot_at: "2026-11-06T14:00:00" } as LiveReading;
const week = { week_start: "2026-10-19", week_end: "2026-10-25" };

beforeEach(() => setTestScope(createScope()));
afterEach(() => setTestScope(null));

describe("StatusCard densities", () => {
  it("simple: badge, figure and sentence, without the line or the change", () => {
    render(<ul><StatusCard status={status("SGH", 25)} note={null} live={live} density="simple" /></ul>);
    const card = screen.getByTestId("status-card");
    expect(within(card).getByTestId("status-badge")).toHaveTextContent("▲Higher than usual");
    expect(within(card).getByTestId("status-hours")).toHaveTextContent("5.0 h");
    expect(within(card).getByTestId("status-sentence")).toHaveTextContent("Bed waits were longer than usual last week. Usual: 4.0 h.");
    expect(within(card).queryByTestId("sparkline")).toBeNull();
    expect(within(card).queryByTestId("status-delta")).toBeNull();
    // The estimate keeps its label and its own time on every density.
    expect(within(card).getByTestId("status-live")).toHaveTextContent(/To see a doctor: under 1 hour \(hospital's own estimate, .*2026/);
  });

  it("full: adds the 12-week line and the change against usual", () => {
    render(<ul><StatusCard status={status("SGH", 25)} note={null} live={null} density="full" /></ul>);
    expect(screen.getByTestId("sparkline")).toBeInTheDocument();
    expect(screen.getByTestId("status-delta")).toHaveTextContent("+25% against usual");
    expect(screen.getByTestId("status-badge")).toHaveTextContent("▲Higher than usual");   // the same badge
  });

  it("full: a fall is signed, and no comparison shows no change at all", () => {
    render(<ul>
      <StatusCard status={status("SGH", -18.4)} note={null} live={null} />
      <StatusCard status={status("AH", null)} note="Urgent care centre" live={null} />
    </ul>);
    const [sgh, ah] = screen.getAllByTestId("status-card");
    expect(within(sgh!).getByTestId("status-delta")).toHaveTextContent("−18% against usual");
    expect(within(ah!).queryByTestId("status-delta")).toBeNull();
    expect(within(ah!).getByTestId("status-badge")).toHaveTextContent("No comparison");
    expect(within(ah!).getByTestId("status-note")).toHaveTextContent("Urgent care centre");
  });

  it("full: the change never disagrees with the badge at a threshold", () => {
    render(<ul>
      <StatusCard status={status("SGH", 14.6)} note={null} live={null} />
      <StatusCard status={status("CGH", 29.9)} note={null} live={null} />
      <StatusCard status={status("TTSH", -14.9)} note={null} live={null} />
      <StatusCard status={status("SKH", 0.4)} note={null} live={null} />
    </ul>);
    const shown = screen.getAllByTestId("status-card").map((c) =>
      [within(c).getByTestId("status-badge").textContent, within(c).getByTestId("status-delta").textContent]);
    expect(shown).toEqual([
      ["●About usual", "+14% against usual"], ["▲Higher than usual", "+29% against usual"],
      ["●About usual", "−14% against usual"], ["●About usual", "0% against usual"]]);
  });
});

describe("StatusGrid", () => {
  const hospitals = [
    hospital("SGH"),
    hospital("AH", { facility_type: "UCC", coverage_note: "Urgent Care Centre at Alexandra Hospital, not a full emergency department." }),
    hospital("NUH", { coverage_note: "Adult emergency department only; NUH Children's Emergency is excluded by MOH." }),
  ];
  const statuses = [status("SGH", 25), status("AH", 2), status("NUH", -3)];

  it("keeps the coverage notes on every density", () => {
    for (const density of ["simple", "full"] as const) {
      setTestScope(createScope());
      const { unmount } = render(<StatusGrid statuses={statuses} hospitals={hospitals} live={[]} meta={edMeta} latestWeek={week} density={density} />);
      const note = (code: string) => within(screen.getAllByTestId("status-card").find((c) => c.getAttribute("data-hospital") === code)!)
        .queryByTestId("status-note");
      expect(note("AH")).toHaveTextContent("Urgent care centre");
      expect(note("NUH")).toHaveTextContent("Adults only");
      expect(note("SGH")).toBeNull();
      expect(screen.getByTestId("status-exclusions")).toHaveTextContent(/excludes KK Women's and Children's Hospital and .*Children's Emergency/);
      expect(screen.getByTestId("provenance-line")).toHaveTextContent(/Data as of 31 Oct 2026 · Source: /);
      unmount();
    }
  });

  it("only mentions the line where a line is shown", () => {
    const { unmount } = render(<StatusGrid statuses={statuses} hospitals={hospitals} live={[]} meta={edMeta} latestWeek={week} density="simple" />);
    expect(screen.getByTestId("status-key")).not.toHaveTextContent("The line shows");
    expect(screen.getByTestId("status-key")).toHaveTextContent("Higher = 15% or more above usual; much higher = 30% or more.");
    unmount();
    setTestScope(createScope());
    render(<StatusGrid statuses={statuses} hospitals={hospitals} live={[]} meta={edMeta} latestWeek={week} />);
    expect(screen.getByTestId("status-key")).toHaveTextContent("The line shows the last 12 weeks.");
  });
});

describe("SummaryStrip", () => {
  const statuses = [status("A", 40), status("B", 20), status("C", 16), status("D", 0), status("E", -20)];

  it("counts the hospitals behind each badge, with the same badges as the cards", () => {
    render(<SummaryStrip statuses={statuses} meta={edMeta} latestWeek={week} hasUcc={false} />);
    const tiles = screen.getAllByTestId("summary-count");
    expect(tiles.map((t) => [t.getAttribute("data-level"), within(t).getByTestId("summary-number").textContent])).toEqual([
      ["much_higher", "1"], ["higher", "2"], ["usual", "1"], ["lower", "1"]]);
    expect(within(tiles[0]!).getByTestId("status-badge")).toHaveTextContent("▲▲Much higher than usual");
    expect(tiles[1]).toHaveTextContent("2hospitals:▲Higher than usual");
    expect(screen.getByTestId("summary-strip")).toHaveTextContent("Week of 19–25 Oct 2026. 5 hospitals");
    expect(screen.getByTestId("provenance-line")).toHaveTextContent(/Data as of 31 Oct 2026 · Source: /);
  });

  it("shows a zero, and counts no comparison on its own", () => {
    render(<SummaryStrip statuses={[status("A", 40), status("B", null)]} meta={edMeta} latestWeek={null} hasUcc />);
    const tiles = screen.getAllByTestId("summary-count");
    expect(tiles.map((t) => [t.getAttribute("data-level"), within(t).getByTestId("summary-number").textContent])).toEqual([
      ["much_higher", "1"], ["higher", "0"], ["usual", "0"], ["lower", "0"], ["unknown", "1"]]);
    expect(screen.getByTestId("summary-strip")).toHaveTextContent("The urgent care centre is counted too");
  });

  it("is not shown without hospitals", () => {
    const { container } = render(<SummaryStrip statuses={[]} meta={edMeta} latestWeek={week} hasUcc={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("HomeNotice", () => {
  it("keeps the emergency line and 'not medical advice' on both densities, under one page heading", () => {
    for (const density of ["full", "simple"] as const) {
      setTestScope(createScope());
      const { unmount } = render(<HomeNotice density={density} />);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByTestId("emergency-note")).toHaveTextContent("In an emergency, call 995");
      expect(screen.getByTestId("not-advice")).toHaveTextContent("isn't medical advice");
      expect(screen.queryByTestId("site-purpose") != null).toBe(density === "full");
      unmount();
    }
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
