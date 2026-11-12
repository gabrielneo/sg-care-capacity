import type { Meta, PopulationYear } from "@/lib/api/types";
import type { StoryInsight } from "@/lib/story";

/** Sample metas for /dev/components and the tests. Shaped like the real /api/v1/ed/summary meta from snapshot data-2026-11-06. */
export const edMeta: Meta = {
  snapshot_id: "data-2026-11-06",
  as_of: "2026-10-31",
  sources: [
    {
      id: "moh_bed_waits",
      name: "MOH, Waiting Time for Admission to Ward",
      url: "https://www.moh.gov.sg/others/resources-and-statistics/healthcare-institution-statistics-waiting-time-for-admission-to-ward/",
      as_of: "2026-10-31",
      as_of_basis: "latest report_date",
      last_fetched_at: "2026-11-06T16:33:44",
    },
    {
      id: "moh_ed_attendances",
      name: "MOH, Attendances at Emergency Medicine Departments",
      url: "https://www.moh.gov.sg/others/resources-and-statistics/healthcare-institution-statistics-attendances-at-emergency-medicine-departments/",
      as_of: "2026-10-31",
      as_of_basis: "latest report_date",
      last_fetched_at: "2026-11-06T16:33:50",
    },
  ],
  coverage: { hospitals_with_a_baseline: 9 },
  caveats: [
    "Average of daily median ward-bed waits (week): Not a weekly median: MOH publishes daily medians only.",
    "AH: Urgent Care Centre, not a full ED.",
  ],
  dq_warnings: [
    {
      check_id: "range.bed_wait_over_24h",
      table: "moh_bed_waits",
      severity: "WARN",
      status: "fail",
      failing_rows: 63,
      scope: "row",
      details: "SGH, 2026-10-20: over 24 hours",
    },
  ],
};

/** Shaped like /api/v1/clinics meta: the CHAS list was last updated 2024-06-06. */
export const clinicMeta: Meta = {
  ...edMeta,
  as_of: "2024-06-06T14:36:42",
  sources: [
    {
      id: "datagov_chas",
      name: "data.gov.sg, CHAS Clinics",
      url: "https://data.gov.sg/datasets/d_548c33ea2d99e29ec63a7cc9edcccedc/view",
      as_of: "2024-06-06T14:36:42",
      as_of_basis: "data.gov.sg lastUpdatedAt",
      last_fetched_at: "2026-11-06T16:34:00",
    },
  ],
  caveats: ["The CHAS clinic list was last updated by data.gov.sg on 2024-06-06."],
  dq_warnings: [],
};

/** Shaped like /api/v1/population meta (SingStat, June 2026). */
export const populationMeta: Meta = {
  ...edMeta,
  as_of: "2026-06-30T00:00:00",
  sources: [
    {
      id: "singstat_residents",
      name: "SingStat, Singapore Residents by Planning Area, Age Group and Sex",
      url: "https://www.singstat.gov.sg/",
      as_of: "2026-06-30",
      as_of_basis: "reference date (end of June)",
      last_fetched_at: "2026-11-06T16:34:42",
    },
  ],
  caveats: ["Only one year is published here, so no trend can be shown."],
  dq_warnings: [],
};

export const populationSample: PopulationYear[] = [
  { year: 2026, reference_date: "2026-06-30", residents_total: 4240430, residents_65plus: 828010, share_65plus: 0.195266,
    planning_areas: 55, planning_areas_with_figures: 55 },
];

/** Shaped like /api/v1/insights meta. */
export const insightMeta: Meta = { ...edMeta, as_of: "2026-10-25", coverage: { insights: 3, in_release: 28 }, dq_warnings: [] };

const PENDING = "Suggested action pending the author's review (docs/insight_actions.yml).";
const base = {
  p_value: 0, p_adjusted: 0, who_acts: null, action: null, as_of: "2026-10-25", as_of_basis: "latest_data",
  period_start: "2026-04-27", period_end: "2026-10-25", strength: "strong",
} as const;

/** The three headline findings of data release data-2026-11-08, as /api/v1/insights?headline=true returns them. */
export const storySample: StoryInsight[] = [
  {
    ...base, insight_id: "weekday-d23b1bdd86", type: "weekday", entity: "SKH", headline_rank: 1, rank_score: 1,
    headline: "At Sengkang General Hospital, bed waits are longest on Tuesdays, 43% above its weekly average.",
    detail: "Waits differ by day of the week over 26 complete weeks. This is unlikely to be chance: the odds are less than 1 in 1,000, allowing for every test run.",
    metric_value: 12.6977, unit: "hours", comparison_value: 8.8864, direction: "neutral", effect_size: 0.4945, n: 182,
    method: "Kruskal-Wallis test across weekdays; epsilon-squared",
    caveats: ["The test shows that weekdays differ; the peak day is the one with the highest average.",
              "MOH doesn't state the unit; the values are read as hours.", PENDING],
    evidence: { endpoint: "/api/v1/ed/daily?hospital=SKH&from=2026-04-27&to=2026-10-25", query: "SELECT ..." },
    display: { value_text: "12.7", unit_text: "hours", metric_label: "Average of daily median bed waits on Tuesdays",
               comparison_label: "8.9 hours, its weekly average", change: "up", change_word: "higher than average" },
    chart: {
      kind: "bar", y_label: "Hours, average of the daily medians on that weekday", x_label: null,
      points: [["mon", "Mon", 9.4], ["tue", "Tue", 12.6977], ["wed", "Wed", 12.5896], ["thu", "Thu", 9.96], ["fri", "Fri", 8.0254],
               ["sat", "Sat", 5.0462], ["sun", "Sun", 4.4862]].map(([key, label, value]) => ({ key: key as string, label: label as string,
               value: value as number })),
      highlight: ["tue"], callout: "Tuesdays: 43% above average", reference: { value: 8.8864, label: "Weekly average" }, trend_line: null,
    },
  },
  {
    ...base, insight_id: "anomaly-371f51c06d", type: "anomaly", entity: "AH", headline_rank: 2, rank_score: 0.509316,
    p_value: null, p_adjusted: null,
    headline: "Bed waits at Alexandra Hospital were unusually long in the week of 19–25 Oct 2026: 2.1 hours.",
    detail: "The usual level over the 8 weeks before was 1.4 hours. A week this far out happens rarely by chance.",
    metric_value: 2.14, unit: "hours", comparison_value: 1.3736, direction: "worse", effect_size: 3.5652, n: 9,
    method: "Robust z-score (median and MAD of the 8 weeks before)",
    caveats: ["One unusual week is not a trend.", "A week's figure is the average of each day's median.",
              "Alexandra Hospital runs an urgent care centre, not a full emergency department.", PENDING],
    evidence: { endpoint: "/api/v1/ed/weekly?hospital=AH&weeks=9", query: "SELECT ..." },
    display: { value_text: "2.1", unit_text: "hours", metric_label: "Average of daily median bed waits, week of 19–25 Oct 2026",
               comparison_label: "1.4 hours, usual for this hospital", change: "up", change_word: "higher than usual" },
    chart: {
      kind: "line", y_label: "Hours, average of each day's median", x_label: null,
      points: [["2026-08-24", "24 Aug", 1.3214], ["2026-08-31", "31 Aug", 1.1814], ["2026-09-07", "7 Sep", 1.23],
               ["2026-09-14", "14 Sep", 1.0457], ["2026-09-21", "21 Sep", 1.4257], ["2026-09-28", "28 Sep", 1.52],
               ["2026-10-05", "5 Oct", 1.78], ["2026-10-12", "12 Oct", 1.4743], ["2026-10-19", "19 Oct", 2.14]]
        .map(([key, label, value]) => ({ key: key as string, label: label as string, value: value as number })),
      highlight: ["2026-10-19"], callout: "19–25 Oct 2026: 2.1 hours", reference: { value: 1.3736, label: "Usual level" },
      trend_line: null,
    },
  },
  {
    ...base, insight_id: "volume_vs_wait-4223d1dfef", type: "volume_vs_wait", entity: "NUH", headline_rank: 3, rank_score: 0.39322,
    headline: "At National University Hospital, bed waits move moderately with ED visits the day before.",
    detail: "Busier days come with longer bed waits, over 181 days after removing the usual weekday pattern. It is an association only.",
    metric_value: 0.3932, unit: "Spearman correlation", comparison_value: null, direction: "neutral", effect_size: 0.3932, n: 181,
    method: "Spearman correlation, visits on day t vs bed wait on day t+1, after removing each weekday's median",
    caveats: ["This is an association only; it does not show why waits move.", "The link is moderate (Spearman correlation 0.39).",
              "MOH's figures for this hospital cover adults only.", PENDING],
    evidence: { endpoint: "/api/v1/ed/daily?hospital=NUH&from=2026-04-27&to=2026-10-25", query: "SELECT ..." },
    display: { value_text: "0.39", unit_text: null, metric_label: "Correlation of ED visits with the bed wait the day after",
               comparison_label: null, change: null, change_word: "moderate link" },
    chart: {
      kind: "bar", y_label: "Bed wait the day after, hours vs usual for that weekday",
      x_label: "Days in five equal groups by ED visits vs usual",
      points: [["q1", "Quietest", -0.545], ["q2", "Quieter", -0.4725], ["q3", "Middle", 0.0925], ["q4", "Busier", 0.335],
               ["q5", "Busiest", 0.465]].map(([key, label, value]) => ({ key: key as string, label: label as string, value: value as number })),
      highlight: ["q5"], callout: "After the busiest days: 1.0 hour longer than after the quietest",
      reference: { value: 0, label: "Usual for that weekday" }, trend_line: null,
    },
  },
];
