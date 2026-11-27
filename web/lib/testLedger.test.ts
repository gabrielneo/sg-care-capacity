import { describe, expect, it } from "vitest";

import type { InsightTest } from "./api/types";
import { ledgerPanels, ledgerTally, outcomeOf, panelDomain } from "./testLedger";

const t = (o: Partial<InsightTest>): InsightTest => ({
  type: "volume_vs_wait", entity: "SGH", variant: "positive", n: 181, n_unit: "days", when: "the day after", effect_size: 0.3,
  metric_value: 0.3, unit: "Spearman correlation", ci_low: 0.15, ci_high: 0.45, ci_null: 0, p_value: 0.005, p_adjusted: 0.02,
  outcome: "published", ...o,
});

describe("outcomeOf", () => {
  it("says the engine's reason in one of five words", () => {
    expect(outcomeOf(t({}))).toBe("published");
    expect(outcomeOf(t({ outcome: "a stronger result for the same hospital was published" }))).toBe("other_lag");
    expect(outcomeOf(t({ outcome: "not significant after correction (adjusted p 0.135)" }))).toBe("not_significant");
    expect(outcomeOf(t({ outcome: "effect below the detector's minimum" }))).toBe("too_small");
    expect(outcomeOf(t({ outcome: "the test could not be computed" }))).toBe("not_computed");
  });
});

describe("ledgerPanels", () => {
  const tests = [
    t({ entity: "SGH", when: "two days after", outcome: "not significant after correction (adjusted p 0.2)" }),
    t({ entity: "CGH", when: "on the same day" }),
    t({ entity: "SGH", when: "on the same day" }),
    t({ type: "trend", entity: "SGH", when: null, metric_value: 0.02, ci_low: -0.01, ci_high: 0.05, outcome: "effect below the detector's minimum" }),
    // A weekday peak in hours over the hospital's average in hours: drawn as a ratio, so every hospital shares one scale.
    t({ type: "weekday", entity: "NUH", when: null, metric_value: 8, ci_low: 7, ci_high: 9, ci_null: 5 }),
    t({ type: "anomaly", entity: "SGH", when: null, effect_size: -1.2, metric_value: 4.4, ci_low: null, ci_high: null, ci_null: null,
        p_value: null, p_adjusted: null, outcome: "effect below the detector's minimum" }),
    t({ type: "access_gap", entity: "BEDOK", when: null, p_value: null, p_adjusted: null }),          // a ranking, not drawn
    t({ type: "trend", entity: "KTPH", metric_value: null }),                                           // an older release: nothing to draw
  ];
  const panels = ledgerPanels(tests);

  it("draws the tests in the page's order, and leaves out rankings and results with no value", () => {
    expect(panels.map((p) => p.type)).toEqual(["weekday", "volume_vs_wait", "trend", "anomaly"]);
    expect(panels.find((p) => p.type === "trend")!.rows.map((r) => r.entity)).toEqual(["SGH"]);
  });

  it("puts the pooled result first", () => {
    const [p] = ledgerPanels([t({ type: "trend", entity: "AH" }), t({ type: "trend", entity: "All hospitals" })]);
    expect(p!.rows.map((r) => r.entity)).toEqual(["All hospitals", "AH"]);
  });

  it("orders a hospital's lags same day, day after, two days after", () => {
    expect(panels[1]!.rows.map((r) => `${r.entity} ${r.when}`)).toEqual(["CGH on the same day", "SGH on the same day", "SGH two days after"]);
  });

  it("puts a weekday peak on its hospital's own scale, and an unusual week as its z-score with no range", () => {
    const [nuh] = panels[0]!.rows;
    expect([nuh!.value, nuh!.low, nuh!.high]).toEqual([1.6, 1.4, 1.8]);
    expect(panels[0]!.zero).toBe(1);
    const [sgh] = panels[3]!.rows;
    expect([sgh!.value, sgh!.low, sgh!.high]).toEqual([-1.2, null, null]);
  });

  it("each panel's scale holds every dot, range and the no-difference line", () => {
    for (const p of panels) {
      const [lo, hi] = panelDomain(p);
      for (const v of [p.zero, ...p.rows.flatMap((r) => [r.value, r.low, r.high])]) if (v != null) expect(v > lo && v < hi).toBe(true);
    }
  });
});

describe("ledgerTally", () => {
  it("counts the tests that passed and did not, and the checks with no test", () => {
    expect(ledgerTally([t({}), t({ outcome: "a stronger result for the same hospital was published" }),
                        t({ outcome: "not significant after correction (adjusted p 0.2)" }),
                        t({ type: "anomaly", p_value: null, outcome: "effect below the detector's minimum" })]))
      .toBe("3 statistical tests this week: 2 passed and 1 did not. Where a hospital passed at more than one lag, only its strongest " +
            "is published. 1 more result was a check with no test " +
            "(unusual weeks, weeks above usual and the clinic ranking).");
  });
});
