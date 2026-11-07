import { describe, expect, it } from "vitest";

import type { Insight } from "./api/types";
import { BED_WAIT_LABEL } from "./copy";
import { populationSample, storySample } from "./samples";
import {
  ACTION_PENDING,
  chartFormat,
  chartTitle,
  monthYear,
  percentText,
  populationShare,
  primaryCaveat,
  readingMinutes,
  storySteps,
  whoActs,
} from "./story";

const [weekday, anomaly, volume] = storySample as [(typeof storySample)[0], (typeof storySample)[0], (typeof storySample)[0]];

describe("storySteps", () => {
  it("takes the headline findings in rank order, at most three", () => {
    const shuffled = [volume, weekday, anomaly];
    expect(storySteps(shuffled).map((i) => i.headline_rank)).toEqual([1, 2, 3]);
    expect(storySteps(shuffled, 2)).toHaveLength(2);
  });

  it("leaves out insights that aren't headline findings, and ones from a release without display or chart", () => {
    const notHeadline = { ...weekday, insight_id: "x", headline_rank: null };
    const noChart: Insight = { ...anomaly, chart: null };
    expect(storySteps([notHeadline, noChart, volume]).map((i) => i.insight_id)).toEqual([volume.insight_id]);
  });
});

describe("chart wording", () => {
  it("titles every bed-wait chart with the Rule 4 label, and a clinics chart with its own axis", () => {
    expect(chartTitle(weekday)).toBe(BED_WAIT_LABEL);
    expect(chartTitle(volume)).toBe(BED_WAIT_LABEL);
    const clinics = { ...weekday, type: "access_gap" as const, chart: { ...weekday.chart, y_label: "CDMP GP clinics per 1,000 residents aged 65+" } };
    expect(chartTitle(clinics)).toBe("CDMP GP clinics per 1,000 residents aged 65+");
  });

  it("writes hours to one decimal, rates to two, and signs values around a zero line", () => {
    expect(chartFormat(weekday)(12.6977)).toBe("12.7");
    expect(chartFormat(volume)(0.465)).toBe("+0.5");
    expect(chartFormat(volume)(-0.545)).toBe("−0.5");
    expect(chartFormat(volume)(0.02)).toBe("0.0");
    const clinics = { ...weekday, type: "access_gap" as const, unit: "CDMP GP clinics per 1,000 residents aged 65+" };
    expect(chartFormat(clinics)(1.2657)).toBe("1.27");
  });
});

describe("actions and caveats", () => {
  it("shows a suggested action only when the author has reviewed it", () => {
    expect(whoActs(weekday)).toBeNull();
    expect(whoActs({ ...weekday, who_acts: "Hospital operations", action: "Plan ahead of Tuesdays." }))
      .toEqual({ who: "Hospital operations", action: "Plan ahead of Tuesdays." });
    expect(ACTION_PENDING).toMatch(/waiting for the author's review/);
  });

  it("the finding's own caveat comes first", () => {
    expect(primaryCaveat(anomaly)).toBe("One unusual week is not a trend.");
    expect(primaryCaveat({ ...anomaly, caveats: [] })).toBeNull();
  });
});

describe("population", () => {
  it("one year is one figure, with no earlier year to compare", () => {
    const s = populationShare(populationSample);
    expect(s?.latest.year).toBe(2026);
    expect(s?.earliest).toBeNull();
    expect(percentText(s!.latest.share_65plus)).toBe("19.5%");
    expect(monthYear(s!.latest.reference_date)).toBe("June 2026");
  });

  it("with more years, the latest and the earliest", () => {
    const older = { ...populationSample[0]!, year: 2020, reference_date: "2020-06-30", share_65plus: 0.15 };
    const s = populationShare([populationSample[0]!, older]);
    expect([s?.latest.year, s?.earliest?.year]).toEqual([2026, 2020]);
  });

  it("no rows, no figure", () => {
    expect(populationShare([])).toBeNull();
  });
});

describe("readingMinutes", () => {
  it("rounds up, at 200 words a minute, at least one minute", () => {
    expect([readingMinutes(0), readingMinutes(200), readingMinutes(304), readingMinutes(2201)]).toEqual([1, 1, 2, 12]);
  });
});
