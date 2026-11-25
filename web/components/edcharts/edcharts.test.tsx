import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Hospital, Insight } from "@/lib/api/types";
import { divergingClasses, type Usual } from "@/lib/edCompare";
import { divergingScale } from "@/lib/palette";

import { Dumbbell } from "./Dumbbell";
import { ModeToggle } from "./ModeToggle";
import { SmallMultiples } from "./SmallMultiples";
import { SlopeChart, spread } from "./SlopeChart";
import { WeekdayHeatmap } from "./WeekdayHeatmap";

const hospital = (code: string, facility_type: "ED" | "UCC" = "ED", coverage_note: string | null = null): Hospital => ({
  hospital_code: code, hospital_name: code, cluster: "x", facility_type, reported_from: null, coverage_note,
  exclusions_note: null, source_url: "https://www.moh.gov.sg/", as_of: "2026-11-06", as_of_basis: "reference_checked" });
const HOSPITALS = [hospital("AH", "UCC"), hospital("NUH", "ED", "Adult emergency department only."), hospital("SGH"), hospital("SKH")];
const usual = (code: string, u: number | null, latest: number | null, weeks = 8): Usual => ({
  code, usual: u, latest, weeks, low: null, high: null, position: null, diff: u != null && latest != null ? latest - u : null,
  pct: u != null && latest != null ? ((latest - u) / u) * 100 : null, z: null, swing: null, rangeWeeks: 0, band: null });
const finding = (type: Insight["type"], entity: string, callout: string, key = "tue") =>
  ({ type, entity, rank_score: 1, chart: { highlight: [key], callout } } as unknown as Insight);

describe("Dumbbell", () => {
  const usuals = { AH: usual("AH", 1.37, 2.14), NUH: usual("NUH", 6, 5.4), SGH: usual("SGH", 8, 8.4), SKH: usual("SKH", null, 9, 7) };

  it("sorts by the size of the difference and labels each row with an arrow and a word", () => {
    render(<Dumbbell usuals={usuals} hospitals={HOSPITALS} mode="usual" finding={null} />);
    const rows = screen.getAllByTestId("dumbbell-row");
    // The EDs by size (−10%, +5%), then the urgent care centre (+56%) in its own group, never ranked among them.
    expect(rows.map((r) => r.getAttribute("data-hospital"))).toEqual(["NUH", "SGH", "AH"]);
    expect(within(screen.getByTestId("dumbbell-ucc")).getByTestId("dumbbell-row")).toHaveAttribute("data-hospital", "AH");
    expect(screen.getByTestId("dumbbell-ucc")).toHaveTextContent("Urgent care centre · Not compared with full emergency departments");
    expect(within(rows[2]!).getByTestId("delta-number")).toHaveTextContent("+56%▲▲ much higher than usual (worse)");   // the badge's two arrows
    expect(within(rows[0]!).getByTestId("delta-change")).toHaveTextContent("about usual");            // −10%: under the badge's 15% line
    expect(screen.getByTestId("dumbbell-missing")).toHaveTextContent("Sengkang General Hospital (SKH) (7 of 8)");
  });

  it("each hospital's name opens its own page, month by month and year on year", () => {
    render(<Dumbbell usuals={usuals} hospitals={HOSPITALS} mode="raw" finding={null} />);
    for (const row of screen.getAllByTestId("dumbbell-row")) {
      const link = within(row).getByTestId("dumbbell-hospital-link");
      expect(link).toHaveAttribute("href", `/hospital/${row.getAttribute("data-hospital")}`);
      expect(link).toHaveAccessibleName(/month by month and year on year/);
    }
  });

  it("annotates the unusual-week finding's hospital, and pins the caveats in raw mode", () => {
    render(<Dumbbell usuals={usuals} hospitals={HOSPITALS} mode="raw" finding={finding("anomaly", "AH", "19–25 Oct 2026: 2.1 hours")} />);
    const ah = screen.getAllByTestId("dumbbell-row").find((r) => r.getAttribute("data-hospital") === "AH")!;
    expect(ah).toHaveAttribute("data-annotated");
    expect(within(ah).getByTestId("chart-callout")).toHaveTextContent("19–25 Oct 2026: 2.1 hours");
    expect(within(ah).getByTestId("pinned-caveat")).toHaveTextContent(/not a full/);
    expect(within(ah).getByTestId("delta-number")).toHaveTextContent(/2\.1 hours\s*vs 1\.4 usual/);
  });
});

describe("Dumbbell: the same words as the badge", () => {
  const eds = ["SKH", "NTFGH", "SGH", "NUH", "TTSH", "WH"].map((c) => ({ ...HOSPITALS[0]!, hospital_code: c, facility_type: "ED" as const, hospital_name: c }));
  const render8 = (usuals: Record<string, Usual>, hospitals = eds) =>
    render(<Dumbbell usuals={usuals} hospitals={hospitals} mode="raw" finding={null} />);
  const word = (code: string) => within(screen.getAllByTestId("dumbbell-row").find((r) => r.getAttribute("data-hospital") === code)!).getByTestId("delta-number");

  it("a small move reads 'about usual', never 'higher' or 'lower': NUH +7% and TTSH −5% are not above or below", () => {
    render8({ SKH: usual("SKH", 9.9, 3.7), NTFGH: usual("NTFGH", 5.6, 3.0), SGH: usual("SGH", 7.6, 5.5), NUH: usual("NUH", 5.7, 6.1),
              TTSH: usual("TTSH", 4.0, 3.8), WH: usual("WH", 4.5, 4.1) });
    expect(word("NUH")).toHaveTextContent("about usual");
    expect(word("NUH")).not.toHaveTextContent(/[▲▼]/);
    expect(word("TTSH")).toHaveTextContent("about usual");
    expect(word("SKH")).toHaveTextContent("▼ lower than usual");
    expect(word("NTFGH")).toHaveTextContent("▼ lower than usual");
  });

  it("the tally says how many are above, about, and below usual, so it agrees with 'N of M above usual'", () => {
    render8({ SKH: usual("SKH", 9.9, 3.7), NTFGH: usual("NTFGH", 5.6, 3.0), SGH: usual("SGH", 7.6, 5.5), NUH: usual("NUH", 5.7, 6.1),
              TTSH: usual("TTSH", 4.0, 3.8), WH: usual("WH", 4.5, 4.1) });
    expect(screen.getByTestId("dumbbell-tally")).toHaveTextContent("Of 6 emergency departments with a comparison: 0 higher than usual, 3 about usual, 3 lower than usual.");
  });

  it("a move that stays inside the range of the 8 weeks before is 'about usual' even at +20%; beyond all of them it is higher", () => {
    const inside = { ...usual("SKH", 5, 6), position: 0 as const };
    const beyond = { ...usual("NUH", 5, 6), position: 1 as const };
    render8({ SKH: inside, NUH: beyond });
    expect(word("SKH")).toHaveTextContent("about usual");
    expect(word("NUH")).toHaveTextContent("▲ higher than usual");
    expect(screen.getByTestId("dumbbell-tally")).toHaveTextContent("1 higher than usual, 1 about usual, 0 lower than usual");
  });

  it("with a 26-week range, a +20% week inside the hospital's own swing says so, and +20% beyond it is higher", () => {
    const ranged = (code: string, z: number) => ({ ...usual(code, 5, 6), position: 1 as const, z, swing: 0.9, rangeWeeks: 26, band: [3, 7] as [number, number] });
    render8({ SKH: ranged("SKH", 1.1), NUH: ranged("NUH", 2.6) });
    expect(word("SKH")).toHaveTextContent("about usual");
    expect(word("NUH")).toHaveTextContent("▲ higher than usual");
    expect(screen.getAllByTestId("within-range")[0]).toHaveTextContent("within its own usual swing of about ±0.9 (previous 26 complete weeks)");
  });

  it("the urgent care centre is shown apart and not counted, and the tally says so", () => {
    render8({ NUH: usual("NUH", 5.7, 6.1), AH: usual("AH", 1.5, 1.6) }, [eds[3]!, { ...HOSPITALS[0]!, hospital_code: "AH", facility_type: "UCC" as never }]);
    expect(screen.getByTestId("dumbbell-tally")).toHaveTextContent("Of 1 emergency department with a comparison");
    expect(screen.getByTestId("dumbbell-tally")).toHaveTextContent("The urgent care centre is not counted.");
    expect(within(screen.getByTestId("dumbbell-ucc")).getByTestId("delta-number")).toHaveTextContent("about usual");
  });

  it("the word is a pill in the badge's own colour per level, so 'higher' and 'much higher' differ in colour and mark", () => {
    render8({ SKH: { ...usual("SKH", 5, 6.2), position: 1 }, NUH: { ...usual("NUH", 5, 8), position: 1 }, SGH: { ...usual("SGH", 8, 4), position: -1 } });
    const pill = (code: string) => within(word(code)).getByTestId("delta-change");
    expect(pill("SKH")).toHaveClass("text-status-higher", "bg-status-higher-soft");
    expect(pill("SKH")).toHaveTextContent(/^▲ higher than usual/);
    expect(pill("NUH")).toHaveClass("text-status-much", "bg-status-much-soft");
    expect(pill("NUH")).toHaveTextContent(/^▲▲ much higher than usual/);
    expect(pill("SGH")).toHaveClass("text-status-lower", "bg-status-lower-soft");
  });

  it("a big move inside the range of the weeks before says so under 'about usual'; a small one does not", () => {
    render8({ SKH: { ...usual("SKH", 5.6, 3.4), position: 0 }, NUH: { ...usual("NUH", 5.7, 5.6), position: 0 } });
    const row = (code: string) => screen.getAllByTestId("dumbbell-row").find((r) => r.getAttribute("data-hospital") === code)!;
    expect(within(row("SKH")).getByTestId("within-range")).toHaveTextContent("within the range of its 8 weeks before");
    expect(within(row("NUH")).queryByTestId("within-range")).toBeNull();
  });

  it("the dot carries the badge's level, so colour matches the word", () => {
    render8({ SKH: usual("SKH", 9.9, 3.7), NUH: usual("NUH", 5.7, 6.1) });
    const dots = Object.fromEntries(screen.getAllByTestId("dumbbell-row").map((r) => [r.getAttribute("data-hospital"), within(r).getByTestId("dumbbell-latest").getAttribute("data-level")]));
    expect(dots).toEqual({ SKH: "lower", NUH: "usual" });
  });
});

describe("spread (slope-chart labels)", () => {
  it("leaves labels that don't overlap where they are", () => {
    expect(spread([20, 60, 100], 16)).toEqual([20, 60, 100]);
  });

  it("pushes overlapping labels apart by the gap, in their order", () => {
    expect(spread([100, 102, 104], 16)).toEqual([100, 116, 132]);
  });

  it("keeps a crowded stack inside the plot: labels past the bottom move back up as a group", () => {
    const out = spread([200, 201, 202], 16, 16, 216);
    expect(Math.max(...out)).toBeLessThanOrEqual(216);
    expect(out).toEqual([184, 200, 216]);
  });
});

describe("SmallMultiples", () => {
  const days = ["2026-11-01", "2026-11-02", "2026-11-03"];
  const bandPoints = days.map((date) => ({ date, p25: -1, p50: 0, p75: 1 }));
  const panel = { hospital: hospital("SGH"), series: [{ date: days[0]!, value: -7.8 }, { date: days[1]!, value: 11.6 }, { date: days[2]!, value: 0.4 }],
                  missingUsual: null };

  it("labels the scale with round ticks in a gutter, 0 among them, not the raw extremes or a 'usual' word on the line", () => {
    render(<SmallMultiples panels={[panel]} bandPoints={bandPoints} mode="usual" finding={null} />);
    const ticks = within(screen.getByTestId("panel-ticks")).getAllByText(/./).map((e) => e.textContent);
    expect(ticks).toContain("0");
    expect(ticks.some((t) => t === "+11.6" || t === "−7.8")).toBe(false);
    expect(ticks.every((t) => /^(0|[+−]\d+(\.\d)?)$/.test(t ?? ""))).toBe(true);
    expect(screen.queryByText("usual", { exact: true })).toBeNull();
  });
});

describe("divergingClasses", () => {
  it("is symmetric about 0, as many classes as the scale, rounded out to whole units", () => {
    const c = divergingClasses([-7.8, 3.2, null, 11.6]);
    expect(c).toHaveLength(divergingScale.length);
    expect(c[0]!.min).toBe(-12);
    expect(c.at(-1)!.max).toBe(12);
    expect(c.map((k) => k.color)).toEqual([...divergingScale]);
    for (let i = 1; i < c.length; i++) expect(c[i]!.min).toBeCloseTo(c[i - 1]!.max);          // ranges meet, no gap
  });

  it("still has a range with no figures", () => {
    const c = divergingClasses([null]);
    expect(c[0]!.min).toBe(-1);
    expect(c.at(-1)!.max).toBe(1);
  });
});

describe("ModeToggle", () => {
  it("keeps the other parameters, marks the current mode, and drops ?mode for the default", () => {
    render(<ModeToggle mode="raw" params={{ hospital: ["SGH", "NUH"], from: "2026-08-01", mode: "raw" }} />);
    const usual = screen.getByRole("link", { name: "Each against its own usual level" });
    const raw = screen.getByRole("link", { name: "Raw values across hospitals" });
    expect(usual).toHaveAttribute("href", "/ed-trends?hospital=SGH&hospital=NUH&from=2026-08-01");
    expect(raw).toHaveAttribute("href", "/ed-trends?hospital=SGH&hospital=NUH&from=2026-08-01&mode=raw");
    expect(raw).toHaveAttribute("aria-current", "page");
    expect(usual).not.toHaveAttribute("aria-current");
  });
});

describe("WeekdayHeatmap", () => {
  const profiles = [{ code: "SGH", values: [25, 10, 0, -5, -10, -15, null], weeks: 26 }];
  it("colours each weekday from the diverging scale and leaves a missing day without colour", () => {
    render(<WeekdayHeatmap profiles={profiles} hospitals={HOSPITALS} mode="usual" finding={null} />);
    const cells = screen.getAllByTestId("heat-cell");
    expect(cells).toHaveLength(7);
    expect(cells[0]).toHaveAttribute("data-value", "25.00");
    expect(divergingScale as readonly string[]).toContain(cells[0]!.getAttribute("data-color"));
    expect(cells[6]).toHaveAttribute("data-value", "");
    expect(cells[6]).toHaveAttribute("data-color", "");
  });
});

describe("SlopeChart", () => {
  const pair = (code: string, moh: number, nuhs: number, bound: "<" | ">" | null = null) =>
    ({ code, moh: { value: moh, date: "2026-11-07" }, nuhs: { value: nuhs, at: "2026-11-17T22:01:30", bound } });
  it("draws a slope per site with a figure on both sides, and names a bounded estimate instead of plotting it", () => {
    render(<SlopeChart pairs={[pair("NUH", 3, 36), pair("NTFGH", 3.2, 9), pair("AH", 1.4, 1, "<")]} finding={null} />);
    expect(screen.getAllByTestId("slope").map((g) => g.getAttribute("data-hospital"))).toEqual(["NUH", "NTFGH"]);
    expect(screen.getByTestId("slope-bounded")).toHaveTextContent("AH");
    expect(screen.getByTestId("slope-caveat")).toHaveTextContent("Different days and different measures");
  });

  it("says so when no site has both figures", () => {
    render(<SlopeChart pairs={[]} finding={null} />);
    expect(screen.queryByTestId("slope-chart")).toBeNull();
  });
});
