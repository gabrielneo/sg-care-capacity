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
    expect(screen.getByTestId("status-delta")).toHaveTextContent("▲ 25%+25% vs usual");
    expect(screen.getByTestId("status-usual")).toHaveTextContent("usual 4.0 h");
    expect(screen.getByTestId("sparkline-band")).toBeInTheDocument();                    // the usual range, shaded
    expect(screen.getByTestId("status-badge")).toHaveTextContent("▲Higher than usual");   // the same badge
  });

  it("full: a fall is signed, and no comparison shows no change at all", () => {
    render(<ul>
      <StatusCard status={status("SGH", -18.4)} note={null} live={null} />
      <StatusCard status={status("AH", null)} note="Urgent care centre" live={null} />
    </ul>);
    const [sgh, ah] = screen.getAllByTestId("status-card");
    expect(within(sgh!).getByTestId("status-delta")).toHaveTextContent("▼ 18%−18% vs usual");
    expect(within(ah!).queryByTestId("status-delta")).toBeNull();
    expect(within(ah!).getByTestId("status-badge")).toHaveTextContent("No comparison");
    expect(within(ah!).getByTestId("status-note")).toHaveTextContent("Urgent care centre");
    expect(within(ah!).getByTestId("status-sentence")).toHaveTextContent("Too few weeks to compare.");
    expect(within(ah!).queryByTestId("sparkline-band")).toBeNull();                      // no usual level, no band
  });

  it("the whole card is one link to the hospital's trends, named by the hospital", () => {
    for (const density of ["simple", "full"] as const) {
      setTestScope(createScope());
      const { unmount } = render(<ul><StatusCard status={status("SGH", 25)} note={null} live={live} density={density} /></ul>);
      const links = within(screen.getByTestId("status-card")).getAllByRole("link");
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAttribute("href", "/ed-trends?hospital=SGH");
      expect(links[0]).toHaveAccessibleName("Singapore General Hospital (SGH)");
      expect(links[0]!.className).toContain("after:absolute");                           // stretched over the card
      unmount();
    }
  });

  it("full: only a hospital above usual keeps a coloured badge", () => {
    render(<ul>
      <StatusCard status={status("SGH", 40)} note={null} live={null} />
      <StatusCard status={status("CGH", 20)} note={null} live={null} />
      <StatusCard status={status("TTSH", 0)} note={null} live={null} />
      <StatusCard status={status("SKH", -20)} note={null} live={null} />
      <StatusCard status={status("WH", 0)} note={null} live={null} density="simple" />
    </ul>);
    const badge = screen.getAllByTestId("status-badge").map((b) => [b.textContent, /text-(bad|warn|ok|muted)/.exec(b.className)?.[1]]);
    expect(badge).toEqual([["▲▲Much higher than usual", "bad"], ["▲Higher than usual", "warn"], ["●About usual", "muted"],
      ["▼Lower than usual", "muted"], ["●About usual", "ok"]]);
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
      ["●About usual", "▲ 14%+14% vs usual"], ["▲Higher than usual", "▲ 29%+29% vs usual"],
      ["●About usual", "▼ 14%−14% vs usual"], ["●About usual", "0%0% vs usual"]]);
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
    expect(screen.getByTestId("status-key")).toHaveTextContent("The line shows the last 12 weeks. The shaded band is the usual range: within 15% of usual.");
  });

  it("full: the order control links to each order and marks the current one; simple has none", () => {
    const { unmount } = render(<StatusGrid statuses={statuses} hospitals={hospitals} live={[]} meta={edMeta} latestWeek={week}
                                           sort="hours" query="view=planner" />);
    const links = within(screen.getByRole("navigation", { name: "Order of the hospitals" })).getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("href"), l.getAttribute("aria-current")])).toEqual([
      ["Against usual", "/?view=planner", null], ["Hours", "/?view=planner&sort=hours", "true"], ["A–Z", "/?view=planner&sort=name", null]]);
    expect(screen.getByTestId("status-definition")).toHaveTextContent("It is not the time to see a doctor.");
    unmount();
    setTestScope(createScope());
    render(<StatusGrid statuses={statuses} hospitals={hospitals} live={[]} meta={edMeta} latestWeek={week} density="simple" sort="hours" />);
    expect(screen.queryByTestId("sort-links")).toBeNull();
  });
});

describe("SummaryStrip", () => {
  const spark = (v: number) => Array.from({ length: 12 }, () => v);
  const at = (code: string, pct: number | null, latest: number | null, line = spark(latest ?? 0)): HospitalStatus =>
    ({ ...status(code, pct, latest), spark: line });
  const hospitals = [hospital("SGH"), hospital("CGH"), hospital("TTSH"), hospital("NUH"), hospital("AH", { facility_type: "UCC" })];
  const statuses = [at("SGH", 31.9, 6.2), at("CGH", 16, 4.0), at("TTSH", 0, 5.0), at("NUH", -20, 7.5), at("AH", 45, 1.2)];
  const tile = (id: string) => screen.getAllByTestId("summary-tile").find((t) => t.getAttribute("data-tile") === id)!;

  it("four tiles from the cards' own figures, each with its date and source", () => {
    render(<SummaryStrip statuses={statuses} hospitals={hospitals} meta={edMeta} latestWeek={week} />);
    expect(screen.getAllByTestId("summary-tile").map((t) => t.getAttribute("data-tile"))).toEqual(["above", "longest", "change", "middle"]);
    for (const t of screen.getAllByTestId("summary-tile")) {
      expect(within(t).getByTestId("provenance-line")).toHaveTextContent(/Data as of 31 Oct 2026 · Source: /);
    }
    // Above usual: the higher and much higher badges, with the list in a tooltip a keyboard can reach.
    expect(tile("above")).toHaveTextContent("Hospitals above usual3 of 5");
    const which = within(tile("above")).getByRole("button", { name: "See which hospitals" });
    expect(document.getElementById(which.getAttribute("aria-describedby")!)).toHaveTextContent(
      "Alexandra Hospital (AH): +45% vs usualSingapore General Hospital (SGH): +31% vs usualChangi General Hospital (CGH): +16% vs usual");
    expect(within(tile("above")).queryByTestId("above-unknown")).toBeNull();
    // Longest bed wait and the middle hospital: raw hours, so the urgent care centre is left out and said to be.
    expect(tile("longest")).toHaveTextContent("Longest bed wait last week7.5 hNational University Hospital (NUH). The urgent care centre isn't ranked.");
    expect(tile("middle")).toHaveTextContent(/bed wait across hospitals, last week5\.6 h/);       // 4.0, 5.0, 6.2, 7.5 -> 5.6
    expect(tile("middle")).toHaveTextContent("Last 12 weeks; middle of 4 hospitals. Urgent care centre left out.");
    expect(within(tile("middle")).getByTestId("sparkline")).toBeInTheDocument();
    // Largest change: each hospital against itself, so the urgent care centre counts; cut, not rounded.
    expect(tile("change")).toHaveTextContent("Largest change against usual+45% vs usualAlexandra Hospital (AH). Usual is the 8-week median.");
    expect(screen.getByTestId("summary-strip")).toHaveTextContent("Week of 19–25 Oct 2026.");
    expect(screen.getByTestId("summary-strip")).toHaveTextContent("It is not the time to see a doctor.");
  });

  it("a fall can be the largest change, and it is signed", () => {
    render(<SummaryStrip statuses={[at("SGH", 16, 5), at("TTSH", -32.7, 4)]} hospitals={hospitals} meta={edMeta} latestWeek={week} />);
    expect(tile("change")).toHaveTextContent("−32% vs usualTan Tock Seng Hospital (TTSH). Usual is the 8-week median.");
  });

  it("missing stays missing: no comparison is counted on its own, and nothing is shown as 0", () => {
    render(<SummaryStrip statuses={[at("NUH", null, null), at("AH", null, 1.2), at("SGH", 2, 5)]} hospitals={hospitals} meta={edMeta}
                         latestWeek={null} />);
    expect(tile("above")).toHaveTextContent("0 of 3None is 15% or more above its usual week.2 with no comparison.");
    expect(within(tile("above")).queryByRole("button")).toBeNull();
    expect(tile("longest")).toHaveTextContent("5.0 hSingapore General Hospital (SGH).");
    // One full ED with a complete week: no middle value, said so, not a number.
    expect(tile("middle")).toHaveTextContent("No dataNeeds 3+ hospitals with a complete week. Urgent care centre left out.");
    expect(within(tile("middle")).queryByTestId("sparkline")).toBeNull();
  });

  it("no usual level anywhere: the largest change is empty, not 0%", () => {
    render(<SummaryStrip statuses={[at("NUH", null, 5)]} hospitals={hospitals} meta={edMeta} latestWeek={week} />);
    expect(tile("change")).toHaveTextContent("No dataNo hospital has enough complete weeks to compare.");
    expect(tile("change")).not.toHaveTextContent("0%");
  });

  it("is not shown without hospitals", () => {
    const { container } = render(<SummaryStrip statuses={[]} hospitals={[]} meta={edMeta} latestWeek={week} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("HomeNotice", () => {
  it("keeps the emergency line and 'not medical advice' on both densities, under one page heading", () => {
    for (const density of ["full", "simple"] as const) {
      setTestScope(createScope());
      const { unmount } = render(<HomeNotice density={density} />);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByTestId("emergency-note")).toHaveTextContent(density === "full" ? "Life-threatening emergency? Call 995." : "In an emergency, call 995");
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
