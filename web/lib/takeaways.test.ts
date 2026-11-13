import { describe, expect, it } from "vitest";

import type { Insight, Meta } from "./api/types";
import { metaFreshness } from "./freshness";
import { storySample } from "./samples";
import { takeaways, takeawaysMeta } from "./takeaways";

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

describe("takeawaysMeta", () => {
  // The /insights response cites every source behind every finding; ED takeaways use MOH's only.
  const meta = {
    as_of: "2026-10-25", caveats: [], coverage: null, snapshot_id: "data-2026-11-09", dq_warnings: [],
    sources: [
      { id: "datagov_chas", name: "data.gov.sg, CHAS clinics", as_of: "2024-06-06T14:36:42", as_of_basis: null, last_fetched_at: null, url: null },
      { id: "moh_bed_waits", name: "MOH, bed waits", as_of: "2026-10-31", as_of_basis: null, last_fetched_at: null, url: null },
      { id: "singstat_residents", name: "SingStat, residents", as_of: "2026-06-30", as_of_basis: null, last_fetched_at: null, url: null },
    ],
  } as unknown as Meta;
  const base = storySample[0] as unknown as Insight;

  it("cites only the datasets the takeaways use, never data.gov.sg or SingStat for ED findings", () => {
    const t = takeaways([{ ...base, headline_rank: 1, source_ids: ["moh_bed_waits"], dq_tables: ["moh_bed_waits"] }], [ed(base.entity)]);
    const own = takeawaysMeta(t, meta);
    expect(own.sources.map((s) => s.id)).toEqual(["moh_bed_waits"]);
    expect(own.as_of).toBe("2026-10-31");
  });

  it("inherits MOH's freshness: never up to date while MOH is due an update", () => {
    const t = takeaways([{ ...base, headline_rank: 1, source_ids: ["moh_bed_waits"], dq_tables: [] }], [ed(base.entity)]);
    expect(metaFreshness(takeawaysMeta(t, meta), new Date("2026-11-14T12:00:00+08:00"))!.label).toBe("Due an update");
  });
});
