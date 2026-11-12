import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Insight } from "@/lib/api/types";
import { CAUSAL_WORDS, selectCallouts } from "@/lib/callouts";
import { insightMeta, storySample } from "@/lib/samples";

import { Callouts } from "./Callouts";

/** One finding per template, with the sentence the engine's templates.yml renders (pipeline tests pin the wording). */
const make = (over: Partial<Insight> & Pick<Insight, "type" | "entity" | "headline">): Insight => ({
  ...storySample[1]!, headline_rank: null, rank_score: 0.5, strength: "moderate", p_adjusted: 0.004,
  period_start: "2026-04-27", period_end: "2026-10-25", source_ids: ["moh_bed_waits"], dq_tables: ["moh_bed_waits"], ...over,
}) as Insight;

const TEMPLATES: Record<string, Insight> = {
  "usual_gap": make({ type: "usual_gap", entity: "AH", p_adjusted: null, strength: "strong", period_start: "2026-10-19",
    headline: "Alexandra Hospital: bed wait 2.1 hours, 50% above its usual 1.4 hours (week of 19–25 Oct 2026).",
    caveats: ["This compares one week with its recent usual level; it is not a statistical test."] }),
  "anomaly": make({ type: "anomaly", entity: "AH", p_adjusted: null, strength: "strong", period_start: "2026-10-19",
    headline: "Bed waits at Alexandra Hospital were unusually long in the week of 19–25 Oct 2026: 2.1 hours.",
    caveats: ["One unusual week is not a trend."] }),
  "weekday (hospital)": make({ type: "weekday", entity: "SKH",
    headline: "At Sengkang General Hospital, bed waits are longest on Tuesdays, 43% above its weekly average.",
    caveats: ["The test shows that weekdays differ; the peak day is the one with the highest average."] }),
  "weekday (pooled)": make({ type: "weekday", entity: "All hospitals",
    headline: "Across all hospitals, bed waits are longest on Mondays, 12% above each hospital's weekly average.",
    caveats: ["Each hospital's waits are compared with its own weekly average before pooling."] }),
  "trend": make({ type: "trend", entity: "SGH",
    headline: "Bed waits at Singapore General Hospital have risen about 0.1 hours a week over the last 26 weeks.",
    caveats: ["Weeks next to each other are similar; the test allows for that."] }),
  "volume_vs_wait": make({ type: "volume_vs_wait", entity: "NUH", strength: "weak",
    headline: "At National University Hospital, bed waits move moderately with ED visits the day before.",
    caveats: ["This is an association only; it does not show why waits move.", "The link is moderate (Spearman correlation 0.39)."] }),
  "source_gap": make({ type: "source_gap", entity: "NUH", source_ids: ["nuhs_live", "moh_bed_waits"],
    headline: "NUHS's live bed-wait estimate for NUH differs from MOH's daily figure by a median 1.2 hours.",
    caveats: ["The two figures measure different things: an estimate at one moment, and the day's median for admitted patients."] }),
};
const ALL = Object.values(TEMPLATES);
const ids = (xs: Insight[]) => xs.map((i) => i.insight_id);

function renderOne(i: Insight, types: Insight["type"][] = [i.type]) {
  return render(<Callouts insights={[i]} types={types} codes={["AH", "NUH", "SGH", "SKH"]} meta={insightMeta} label="test" />);
}

describe("Callouts: one snapshot per template", () => {
  it.each(Object.entries(TEMPLATES))("%s", (_name, insight) => {
    renderOne(insight);
    expect(screen.getByTestId("callout").textContent).toMatchSnapshot();
  });
});

describe("Callouts: what every callout carries", () => {
  it.each(Object.entries(TEMPLATES))("%s has strength as a symbol and a word, its dates, its source and a link", (_n, insight) => {
    renderOne(insight);
    const c = screen.getByTestId("callout");
    expect(within(c).getByTestId("callout-strength")).toHaveTextContent(/[○◔◑●] Strength: (weak|moderate|strong)/);
    expect(within(c).getByTestId("callout-provenance")).toHaveTextContent(/Data as of \d+ \w+ 2026 \((MOH|NUHS)\)/);
    expect(within(c).getByTestId("callout-provenance")).toHaveTextContent("Uses data from");
    expect(within(c).getByRole("link", { name: "Read the finding" })).toHaveAttribute("href", expect.stringMatching(/^\/findings#/));
  });

  it("says a comparison with no test is not a statistical test", () => {
    renderOne(TEMPLATES["usual_gap"]!);
    expect(screen.getByTestId("callout-strength")).toHaveTextContent("A plain comparison, not a statistical test");
  });

  it("shows the association caveat first on a visits-and-waits finding", () => {
    renderOne(TEMPLATES["volume_vs_wait"]!);
    expect(screen.getByTestId("callout")).toHaveTextContent("This is an association only; it does not show why waits move.");
  });

  it("dates a NUHS finding by both of its sources", () => {
    renderOne(TEMPLATES["source_gap"]!);
    expect(screen.getByTestId("callout-provenance")).toHaveTextContent("(MOH)");
  });

  it("links a headline finding to its own place on the Findings page, any other to the section", () => {
    renderOne({ ...TEMPLATES["anomaly"]!, headline_rank: 2 });
    expect(screen.getByRole("link", { name: "Read the finding" })).toHaveAttribute("href", `/findings#${TEMPLATES["anomaly"]!.insight_id}`);
  });
});

describe("Callouts: never a cause", () => {
  it("no rendered callout contains 'due to' or 'caused' (or any causal word)", () => {
    const { container } = render(
      <Callouts insights={[...ALL, ...storySample]} types={["usual_gap", "anomaly", "weekday", "trend", "volume_vs_wait", "source_gap"]}
                codes={["AH", "NUH", "SGH", "SKH"]} meta={insightMeta} label="all" />);
    const text = container.textContent ?? "";
    expect(text.length).toBeGreaterThan(100);
    expect(text).not.toMatch(/due to/i);
    expect(text).not.toMatch(/caused/i);
    expect(text).not.toMatch(CAUSAL_WORDS);
  });

  it("the check itself catches the words", () => {
    for (const bad of ["Waits rose due to flu.", "Visits caused delays.", "Because of flu", "drives waits"]) expect(bad).toMatch(CAUSAL_WORDS);
  });
});

describe("selectCallouts", () => {
  const at = (entity: string, rank_score: number, type: Insight["type"] = "weekday") =>
    ({ ...TEMPLATES["weekday (hospital)"]!, insight_id: `${type}-${entity}`, entity, rank_score, type }) as Insight;

  it("shows the two strongest and puts the rest behind More findings", () => {
    const xs = [at("SGH", 0.3), at("AH", 0.9), at("NUH", 0.6), at("SKH", 0.1)];
    const { shown, more } = selectCallouts(xs, ["weekday"], ["SGH", "AH", "NUH", "SKH"]);
    expect(ids(shown)).toEqual(["weekday-AH", "weekday-NUH"]);
    expect(ids(more)).toEqual(["weekday-SGH", "weekday-SKH"]);
  });

  it("keeps one finding per hospital: the stronger of two describing the same week", () => {
    const xs = [at("AH", 0.4, "usual_gap"), at("AH", 0.7, "anomaly"), at("SGH", 0.2, "usual_gap")];
    const { shown } = selectCallouts(xs, ["usual_gap", "anomaly"], ["AH", "SGH"]);
    expect(ids(shown)).toEqual(["anomaly-AH", "usual_gap-SGH"]);
  });

  it("leaves out other sections' types, hospitals not chosen, and findings with no chart data", () => {
    const xs = [at("AH", 0.9, "trend"), at("SGH", 0.5), { ...at("NUH", 0.8), display: null } as Insight, at("All hospitals", 0.4)];
    expect(ids(selectCallouts(xs, ["weekday"], ["SGH"]).shown)).toEqual(["weekday-SGH", "weekday-All hospitals"]);
  });

  it("is empty when nothing applies (a quiet week)", () => {
    expect(selectCallouts([], ["weekday"], ["SGH"])).toEqual({ shown: [], more: [] });
  });
});

describe("Callouts: layout", () => {
  const four = ["SGH", "AH", "NUH", "SKH"].map((e, k) => ({ ...TEMPLATES["weekday (hospital)"]!, insight_id: `w-${e}`, entity: e, rank_score: 0.9 - k / 10 }));

  it("renders two callouts and a keyboard-reachable More findings with the rest", () => {
    render(<Callouts insights={four} types={["weekday"]} codes={["SGH", "AH", "NUH", "SKH"]} meta={insightMeta} label="weekday" />);
    expect(screen.getAllByTestId("callout")).toHaveLength(4);                      // 2 shown + 2 inside the closed <details>
    const more = screen.getByTestId("callouts-more");
    expect(more.tagName).toBe("DETAILS");
    expect(more).not.toHaveAttribute("open");
    expect(within(more).getByText("More findings (2)").tagName).toBe("SUMMARY");
    expect(within(more).getAllByTestId("callout")).toHaveLength(2);
  });

  it("renders nothing at all when there is no finding (the chart stands alone)", () => {
    const { container } = render(<Callouts insights={[]} types={["weekday"]} codes={["SGH"]} meta={insightMeta} label="weekday" />);
    expect(container).toBeEmptyDOMElement();
  });
});
