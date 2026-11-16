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
  pct: u != null && latest != null ? ((latest - u) / u) * 100 : null });
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
    expect(within(rows[2]!).getByTestId("delta-number")).toHaveTextContent("+56%▲ much higher than usual (worse)");
    expect(within(rows[0]!).getByTestId("delta-change")).toHaveTextContent("about usual");            // −10%: under the badge's 15% line
    expect(screen.getByTestId("dumbbell-missing")).toHaveTextContent("Sengkang General Hospital (SKH) (7 of 8)");
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

  it("the urgent care centre is shown apart and not counted, and the tally says so", () => {
    render8({ NUH: usual("NUH", 5.7, 6.1), AH: usual("AH", 1.5, 1.6) }, [eds[3]!, { ...HOSPITALS[0]!, hospital_code: "AH", facility_type: "UCC" as never }]);
    expect(screen.getByTestId("dumbbell-tally")).toHaveTextContent("Of 1 emergency department with a comparison");
    expect(screen.getByTestId("dumbbell-tally")).toHaveTextContent("The urgent care centre is not counted.");
    expect(within(screen.getByTestId("dumbbell-ucc")).getByTestId("delta-number")).toHaveTextContent("about usual");
  });

  it("the dot carries the badge's level, so colour matches the word", () => {
    render8({ SKH: usual("SKH", 9.9, 3.7), NUH: usual("NUH", 5.7, 6.1) });
    const dots = Object.fromEntries(screen.getAllByTestId("dumbbell-row").map((r) => [r.getAttribute("data-hospital"), within(r).getByTestId("dumbbell-latest").getAttribute("data-level")]));
    expect(dots).toEqual({ SKH: "lower", NUH: "usual" });
  });
});
