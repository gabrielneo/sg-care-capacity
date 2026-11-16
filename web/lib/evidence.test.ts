import { describe, expect, it } from "vitest";

import type { Insight } from "./api/types";
import { EVIDENCE_LABEL, evidenceOf, PROBABILITY, safeDetail, sampleText } from "./evidence";
import { storySample } from "./samples";

const base = storySample[0] as unknown as Insight;

describe("evidence levels (audit B1)", () => {
  it("uses the engine's level, and reads one from the p-value for an older release", () => {
    expect(evidenceOf({ ...base, evidence_level: "robust" })).toBe("robust");
    expect(evidenceOf({ ...base, evidence_level: null, p_adjusted: null })).toBe("observed");
    expect(evidenceOf({ ...base, evidence_level: null, p_adjusted: 0.001, type: "volume_vs_wait" })).toBe("association-only");
    expect(evidenceOf({ ...base, evidence_level: null, p_adjusted: 0.001, type: "monthly_yoy" })).toBe("association-only");
    expect(evidenceOf({ ...base, evidence_level: null, p_adjusted: 0.001, type: "trend" })).toBe("tested");
    expect(EVIDENCE_LABEL.observed).toBe("Observed, not tested");
  });

  it("never shows probability language for a finding without a p-value", () => {
    const old = { detail: "The usual level over the 8 weeks before was 1.4 hours. A week this far out happens rarely by chance.", p_adjusted: null };
    expect(safeDetail(old)).toBe("The usual level over the 8 weeks before was 1.4 hours.");
    const tested = { detail: "Waits differ by day. This is unlikely to be chance: the odds are less than 1 in 1,000.", p_adjusted: 0.0001 };
    expect(safeDetail(tested)).toBe(tested.detail);
  });

  it("fails if any sample finding speaks of chance without a p-value", () => {
    for (const i of storySample as unknown as Insight[]) {
      if (i.p_adjusted == null) expect(safeDetail(i), i.insight_id).not.toMatch(PROBABILITY);
      if (i.p_adjusted == null) expect(i.headline, i.insight_id).not.toMatch(PROBABILITY);
    }
  });
});

describe("n and the 95% range beside every finding (audit B3)", () => {
  it("states n with its unit, and the interval where there is one", () => {
    expect(sampleText({ ...base, n: 182, n_unit: "days", unit: "hours", ci_low: 11.3038, ci_high: 13.9801 }))
      .toBe("n = 182 days · 95% range 11.3 to 14.0 hours");
    expect(sampleText({ ...base, n: 9, n_unit: "weeks", unit: "hours", ci_low: null, ci_high: null })).toBe("n = 9 weeks");
    expect(sampleText({ ...base, n: 181, n_unit: "days", unit: "Spearman correlation", ci_low: 0.2591, ci_high: 0.514 }))
      .toBe("n = 181 days · 95% range 0.26 to 0.51");
    expect(sampleText({ ...base, n: 50140, n_unit: undefined, ci_low: null, ci_high: null })).toBe("n = 50,140");
  });
});
