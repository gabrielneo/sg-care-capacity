import { describe, expect, it } from "vitest";

import type { Insight } from "./api/types";
import { storySample } from "./samples";
import { takeaways } from "./takeaways";

const ed = (hospital_code: string) => ({ hospital_code, facility_type: "ED" as const });
const HOSPITALS = [ed("SKH"), ed("NUH"), { hospital_code: "AH", facility_type: "UCC" as const }];

describe("takeaways", () => {
  it("are the engine's headline findings in rank order, in the engine's own words", () => {
    const t = takeaways(storySample as unknown as Insight[], HOSPITALS);
    expect(t.length).toBeGreaterThan(0);
    expect(t.length).toBeLessThanOrEqual(3);
    const ranks = t.map((x) => storySample.find((s) => s.insight_id === x.id)!.headline_rank);
    expect(ranks).toEqual([...ranks].sort());
    for (const x of t) {
      const src = storySample.find((s) => s.insight_id === x.id)!;
      expect(x.title).toBe(src.chart!.callout);
      expect(x.headline).toBe(src.headline);
    }
  });

  it("never include a finding about the urgent care centre", () => {
    const t = takeaways(storySample as unknown as Insight[], HOSPITALS);
    expect(t.map((x) => x.entity)).not.toContain("AH");
    expect(storySample.some((s) => s.entity === "AH" && s.headline_rank)).toBe(true);   // the sample has one to leave out
  });

  it("joins the numbers only when the engine gives a comparison", () => {
    const base = storySample[0] as unknown as Insight;
    const [withComparison] = takeaways([{ ...base, headline_rank: 1 }], [ed(base.entity)]);
    expect(withComparison!.numbers).toBe(`${base.display!.value_text} ${base.display!.unit_text} · vs ${base.display!.comparison_label}`);
    const [without] = takeaways([{ ...base, headline_rank: 1, display: { ...base.display!, comparison_label: null } }], []);
    expect(without!.numbers).toBeNull();
    const repeated = { ...base, headline_rank: 1, chart: { ...base.chart!, callout: `Week of 19 Oct: ${base.display!.value_text} ${base.display!.unit_text}` } };
    expect(takeaways([repeated as Insight], [])[0]!.numbers).toBe(`vs ${base.display!.comparison_label}`);
    expect(without!.isHospital).toBe(false);
  });

  it("leaves out findings that aren't headlines or have no callout", () => {
    const base = storySample[0] as unknown as Insight;
    expect(takeaways([{ ...base, headline_rank: null }], [])).toEqual([]);
    expect(takeaways([{ ...base, headline_rank: 1, chart: null }], [])).toEqual([]);
  });
});
