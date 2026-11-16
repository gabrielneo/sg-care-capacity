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
const NAMES: Record<string, [string, string]> = {
  SGH: ["Singapore General Hospital", "Singapore General"], CGH: ["Changi General Hospital", "Changi General"],
  TTSH: ["Tan Tock Seng Hospital", "Tan Tock Seng"], NUH: ["National University Hospital", "National University"],
  AH: ["Alexandra Hospital (UCC)", "Alexandra"],
};
const hospital = (code: string, over: Partial<Hospital> = {}): Hospital => ({
  hospital_code: code, hospital_name: NAMES[code]?.[0] ?? code, short_name: NAMES[code]?.[1] ?? null, cluster: "NUHS", facility_type: "ED", reported_from: null, coverage_note: null,
  exclusions_note: "MOH excludes KK Women's and Children's Hospital and NUH Children's Emergency from these statistics.",
  source_url: "https://www.moh.gov.sg/", as_of: "2026-11-06", as_of_basis: "reference_checked", ...over } as Hospital);
const live = { hospital_code: "SGH", is_adult_ed: true, est_wait_to_see_doctor_hours: 1, est_wait_to_see_doctor_qualifier: "<",
  snapshot_at: "2026-11-06T14:00:00" } as LiveReading;
const week = { week_start: "2026-10-19", week_end: "2026-10-25" };

beforeEach(() => setTestScope(createScope()));
afterEach(() => setTestScope(null));

describe("StatusCard densities", () => {
  it("names the hospital by short name and code, and says when NUHS gives no estimate (audit G4, G5)", () => {
    render(<ul><StatusCard status={status("SGH", 25)} hospital={hospital("SGH")} note={null} live={null} density="full" /></ul>);
    expect(screen.getByTestId("hospital-name")).toHaveAttribute("title", "Singapore General Hospital");
    expect(screen.getByTestId("hospital-name")).toHaveTextContent(/^Singapore General SGH/);
    expect(screen.getByTestId("status-live-none")).toHaveTextContent(/Doctor wait: no .*NUHS.* estimate/);
  });

  it("simple: badge, figure and sentence, without the line or the change", () => {
    render(<ul><StatusCard status={status("SGH", 25)} note={null} live={live} weeklyAsOf="2026-10-31" density="simple" /></ul>);
    const card = screen.getByTestId("status-card");
    expect(within(card).getByTestId("status-badge")).toHaveTextContent("▲Higher than usual");
    expect(within(card).getByTestId("status-hours")).toHaveTextContent("5.0 h");
    expect(within(card).getByTestId("status-sentence")).toHaveTextContent("Bed waits were longer than usual in the latest complete week. Usual: 4.0 h.");
    expect(within(card).queryByTestId("sparkline")).toBeNull();
    expect(within(card).queryByTestId("status-delta")).toBeNull();
    // The estimate keeps its label and its own time on every density.
    expect(within(card).getByTestId("status-live")).toHaveTextContent(/To see a doctor: under 1 hour \(.*NUHS\) estimate, .*2026, .* SGT\)/);
    expect(within(card).getByTestId("nuhs-timing")).toHaveTextContent("Published separately by NUHS, so newer than the weekly data.");
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
      expect(links[0]).toHaveAccessibleName(density === "full"
        ? "Singapore General Hospital (SGH), Higher than usual, too few weeks to describe a trend" : "Singapore General Hospital (SGH)");
      expect(links[0]!.className).toContain("after:absolute");                           // stretched over the card
      unmount();
    }
  });

  it("full: every badge has its status fill, symbol and words; simple is the same", () => {
    render(<ul>
      <StatusCard status={status("SGH", 40)} note={null} live={null} />
      <StatusCard status={status("CGH", 20)} note={null} live={null} />
      <StatusCard status={status("TTSH", 0)} note={null} live={null} />
      <StatusCard status={status("SKH", -20)} note={null} live={null} />
      <StatusCard status={status("WH", 0)} note={null} live={null} density="simple" />
    </ul>);
    const badge = screen.getAllByTestId("status-badge").map((b) => [b.textContent, /text-(status-much|status-higher|status-usual|status-lower)/.exec(b.className)?.[1],
      /bg-(status-\w+)-soft/.exec(b.className)?.[1]]);
    expect(badge).toEqual([["▲▲Much higher than usual", "status-much", "status-much"], ["▲Higher than usual", "status-higher", "status-higher"],
      ["●About usual", "status-usual", "status-usual"], ["▼Lower than usual", "status-lower", "status-lower"], ["●About usual", "status-usual", "status-usual"]]);
  });

  it("full: only a hospital above usual has a status-coloured left edge", () => {
    render(<ul>
      <StatusCard status={status("SGH", 40)} note={null} live={null} />
      <StatusCard status={status("CGH", 20)} note={null} live={null} />
      <StatusCard status={status("TTSH", 0)} note={null} live={null} />
      <StatusCard status={status("SKH", -20)} note={null} live={null} />
      <StatusCard status={status("AH", null)} note={null} live={null} />
    </ul>);
    const cards = screen.getAllByTestId("status-card");
    expect(cards.map((c) => c.getAttribute("data-edge"))).toEqual(["true", "true", "false", "false", "false"]);
    expect(cards[0]).toHaveClass("border-l-status-much");
    expect(cards[1]).toHaveClass("border-l-status-higher");
    expect(cards[2]!.className).not.toMatch(/border-l-status/);
  });

  it("full: always the six slots, in order, whether or not there is a caveat, an estimate or a comparison", () => {
    const slots = (c: HTMLElement) => ["sc-name", "sc-chips", "sc-label", "sc-value", "sc-delta", "sc-foot"]
      .map((k) => c.querySelector(`.${k}`) ? k : null);
    render(<ul>
      <StatusCard status={status("SGH", 25)} hospital={hospital("SGH")} note={null} live={live} />
      <StatusCard status={status("NUH", -3)} hospital={hospital("NUH")} note="Adults only" live={null} />
      <StatusCard status={status("AH", null, null)} note="Urgent care centre" live={null} />
    </ul>);
    for (const c of screen.getAllByTestId("status-card")) {
      expect(slots(c)).toEqual(["sc-name", "sc-chips", "sc-label", "sc-value", "sc-delta", "sc-foot"]);
      expect(c.querySelector(".sc-name")!.nextElementSibling).toBe(c.querySelector(".sc-chips"));
      expect(c.querySelector(".sc-label")).toHaveTextContent("Bed wait, latest complete week");
    }
  });

  it("full: the footer is the NUHS estimate with its own short time, or says there is none, and the trend is in the name", () => {
    render(<ul>
      <StatusCard status={{ ...status("SGH", 25), spark: [4, 4, 4, 4, 4, 4, 4, 4, 6, 6, 6, 6] }} hospital={hospital("SGH")} note={null} live={live} />
      <StatusCard status={status("NUH", 0)} hospital={hospital("NUH")} note="Adults only" live={null} />
    </ul>);
    const [a, b] = screen.getAllByTestId("status-card");
    expect(within(a!).getByTestId("status-live")).toHaveTextContent(/To see a doctor: under 1 h · .*NUHS.* estimate, 6 Nov 2:00 pm/);
    expect(within(a!).queryByTestId("nuhs-timing")).toBeNull();                          // said once, in the section's key
    expect(within(a!).getByRole("link")).toHaveAccessibleName("Singapore General Hospital (SGH), Higher than usual, rising over 12 weeks");
    expect(within(b!).getByTestId("status-live-none")).toHaveClass("text-tertiary");
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
      // The date and source are the section header's one line; the grid adds none of its own.
      expect(screen.getByTestId("section-meta")).toHaveTextContent(/Source: .* · Data as of 31 Oct 2026/);
      expect(screen.queryByTestId("provenance-line")).toBeNull();
      expect(screen.queryByTestId("status-definition")).toBeNull();
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

  it("full: the urgent care centre is one full-width card under the grid, and the key says NUHS publishes separately", () => {
    render(<StatusGrid statuses={statuses} hospitals={hospitals} live={[]} meta={edMeta} latestWeek={week} sort="usual" />);
    const ucc = within(screen.getByTestId("status-ucc"));
    expect(ucc.getByRole("heading", { name: "Urgent care centre" })).toBeInTheDocument();
    expect(ucc.getAllByTestId("status-card")).toHaveLength(1);
    expect(ucc.getByTestId("status-card")).toHaveClass("sc-wide");
    expect(screen.getAllByTestId("status-group").filter((g) => g.getAttribute("data-group") === "ed").flatMap((g) => within(g).getAllByTestId("status-card"))).toHaveLength(2);
    expect(screen.getByTestId("status-key")).toHaveTextContent("NUHS publishes it separately, with its own time on each card");
    // The order control is the header's actions slot, not part of the lede row.
    expect(screen.getByTestId("section-header")).toHaveAttribute("data-actions", "true");
  });

  it("full: the order control links to each order and marks the current one; simple has none", () => {
    const { unmount } = render(<StatusGrid statuses={statuses} hospitals={hospitals} live={[]} meta={edMeta} latestWeek={week}
                                           sort="hours" query="view=planner" />);
    const links = within(screen.getByRole("navigation", { name: "Order of the hospitals" })).getAllByRole("link");
    expect(links.map((l) => [l.textContent?.replace("✓", ""), l.getAttribute("href"), l.getAttribute("aria-current")])).toEqual([
      ["Change vs usual", "/find?view=planner", null], ["Hours", "/find?view=planner&sort=hours", "true"], ["A–Z", "/find?view=planner&sort=name", null]]);
    // The bed-wait definition is in the page intro, not repeated under the cards (E3); the badge legend is a popover in the header.
    expect(screen.queryByTestId("status-definition")).toBeNull();
    expect(screen.getByRole("button", { name: "What the badges mean" })).toBeInTheDocument();
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
  const hospitals = [hospital("SGH"), hospital("CGH"), hospital("TTSH"), hospital("NUH", { coverage_note: "Adult emergency department only; NUH Children's Emergency is excluded by MOH." }), hospital("AH", { facility_type: "UCC" })];
  const statuses = [at("SGH", 31.9, 6.2), at("CGH", 16, 4.0), at("TTSH", 0, 5.0), at("NUH", -20, 7.5), at("AH", 45, 1.2)];
  const tile = (id: string) => screen.getAllByTestId("summary-tile").find((t) => t.getAttribute("data-tile") === id)!;

  it("four tiles from the cards' own figures, with one date and source for all", () => {
    render(<SummaryStrip statuses={statuses} hospitals={hospitals} meta={edMeta} latestWeek={week} />);
    expect(screen.getAllByTestId("summary-tile").map((t) => t.getAttribute("data-tile"))).toEqual(["above", "longest", "change", "middle"]);
    // Stated once for the section (its header), not on each tile.
    expect(screen.queryByTestId("provenance-line")).toBeNull();
    expect(screen.getAllByTestId("section-meta")).toHaveLength(1);
    expect(screen.getByTestId("section-meta")).toHaveTextContent("Latest complete week (19–25 Oct 2026) · Source: ");
    expect(screen.getByTestId("section-meta")).toHaveTextContent("Data as of 31 Oct 2026");
    for (const t of screen.getAllByTestId("summary-tile")) expect(t).not.toHaveTextContent(/Data as of|Source:/);
    // Every tile is a link to the hospital card it is about, or to the cards.
    expect(within(tile("above")).getByRole("link")).toHaveAttribute("href", "#section-hospitals");
    expect(within(tile("longest")).getByRole("link")).toHaveAttribute("href", "#hospital-NUH");
    expect(within(tile("change")).getByRole("link")).toHaveAttribute("href", "#hospital-SGH");
    expect(within(tile("middle")).getByRole("link")).toHaveAttribute("href", "#section-hospitals");
    // None has a micro-visual, so the four are the same shape (D5).
    expect(screen.queryByTestId("kpi-visual")).toBeNull();
    // Above usual: the higher and much higher badges, with the list in a tooltip a keyboard can reach.
    // The urgent care centre (AH, +45%) is left out of all four (ADR 0012), and one line says so.
    expect(tile("above")).toHaveTextContent("Emergency departments above usual. Show the hospital cards2 of 4");
    const which = within(tile("above")).getByRole("button", { name: "See which hospitals" });
    expect(document.getElementById(which.getAttribute("aria-describedby")!)).toHaveTextContent(
      // Short name and code; the full name is there for screen readers (audit G4).
      "Singapore General (SGH)Singapore General Hospital (SGH): +31% vs usualChangi General (CGH)Changi General Hospital (CGH): +16% vs usual");
    expect(screen.getByTestId("summary-ucc-note")).toHaveTextContent(
      "The urgent care centre is left out of these four figures. Not compared with full emergency departments.");
    // NUH covers adults only: said on the tile where it is the longest wait, and once under the tiles (audit M6).
    expect(screen.getByTestId("summary-adults-note")).toHaveTextContent("covers its adult emergency department only");
    expect(tile("longest")).toHaveTextContent("Adult emergency department only.");
    expect(within(tile("above")).queryByTestId("above-unknown")).toBeNull();
    expect(tile("longest")).toHaveTextContent(/^Longest bed wait\. Show its hospital card7\.5 hNational University \(NUH\)National University HospitalAdult emergency department only\./);   // label, then its tooltip
    expect(tile("middle")).toHaveTextContent(/Typical bed wait across emergency departments\. Show the hospital cards5\.6 h/);   // 4.0, 5.0, 6.2, 7.5 -> 5.6
    expect(tile("middle")).toHaveTextContent(/Median.*of 4 emergency departments\./);
    expect(within(tile("middle")).queryByTestId("sparkline")).toBeNull();   // the 12-week trend is in the hospital section's header
    // Largest change: a ranking of hospitals, so the urgent care centre's +45% is left out; cut, not rounded.
    expect(tile("change")).toHaveTextContent(/^Biggest change vs the 8-week usual\. Show its hospital card\+31%Singapore General \(SGH\)Singapore General Hospital$/);
    // The bed-wait definition is not repeated here (E3): it is in the page intro.
    expect(screen.getByTestId("summary-strip")).not.toHaveTextContent("It is not the time to see a doctor.");
  });

  it("a fall can be the largest change, and it is signed", () => {
    render(<SummaryStrip statuses={[at("SGH", 16, 5), at("TTSH", -32.7, 4)]} hospitals={hospitals} meta={edMeta} latestWeek={week} />);
    expect(tile("change")).toHaveTextContent(/−32%Tan Tock Seng \(TTSH\)Tan Tock Seng Hospital$/);
  });

  it("missing stays missing: no comparison is counted on its own, and nothing is shown as 0", () => {
    render(<SummaryStrip statuses={[at("NUH", null, null), at("AH", null, 1.2), at("SGH", 2, 5)]} hospitals={hospitals} meta={edMeta}
                         latestWeek={null} />);
    expect(tile("above")).toHaveTextContent("0 of 2None is 15% or more above its usual week.1 with no comparison.");
    expect(within(tile("above")).queryByRole("button")).toBeNull();
    expect(tile("longest")).toHaveTextContent(/5\.0 hSingapore General \(SGH\)Singapore General Hospital$/);
    // One full ED with a complete week: no middle value, said so, not a number.
    expect(tile("middle")).toHaveTextContent("No dataNeeds 3+ emergency departments with a complete week.");
    expect(within(tile("middle")).queryByTestId("sparkline")).toBeNull();
  });

  it("no usual level anywhere: the largest change is empty, not 0%", () => {
    render(<SummaryStrip statuses={[at("NUH", null, 5)]} hospitals={hospitals} meta={edMeta} latestWeek={week} />);
    expect(tile("change")).toHaveTextContent("No dataNo emergency department has enough complete weeks to compare.");
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
      // Full: no 995 banner (the footer carries the number); "not medical advice" is its own line. Simple: one line under the heading, with 995 as a tel: link.
      if (density === "full") {
        expect(screen.queryByTestId("emergency-note")).toBeNull();
        expect(screen.getByTestId("not-advice")).toHaveTextContent("isn't medical advice");
      }
      else {
        expect(screen.getByTestId("emergency-note")).toHaveTextContent("Emergency? Call 995. This site shows public statistics, not medical advice.");
        expect(screen.queryByTestId("not-advice")).toBeNull();
        expect(screen.getByRole("link", { name: "Call 995" })).toHaveAttribute("href", "tel:995");
        // The intro ends in the marker that the status strip waits for; neither density has the CV line any more.
        expect(document.querySelector("[data-strip-sentinel]")).not.toBeNull();
      }
      // The bed-wait definition is stated once, in the intro of Planner and Analyst (E3); the public view has no cards to define.
      expect(screen.queryByTestId("bed-wait-definition") != null).toBe(density === "simple");
      if (density === "simple") expect(screen.getByTestId("bed-wait-definition")).toHaveTextContent("decision to admit");
      expect(screen.queryByTestId("project-link")).toBeNull();
      expect(screen.queryByText(/CV or LinkedIn/)).toBeNull();
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
