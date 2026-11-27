/**
 * The Findings page's chart of every test (GET /api/v1/insights/tests): each result the engine weighed, published or not, as a dot
 * with its 95% range. Presentation only: every number is the engine's; this module picks the scale each panel is drawn on and says
 * the outcome in words. It decides nothing about what is published.
 */
import type { Insight, InsightTest } from "./api/types";
import { RANGE_WEEKS, TREND_WEEKS } from "./windows";

/** Each detector's question in plain words: the Findings page's groups and this chart's panels use the same ones. */
export const FINDING_GROUPS: { type: Insight["type"]; title: string; question: string }[] = [
  { type: "weekday", title: "Day of the week", question: "Do bed waits peak on a particular day?" },
  { type: "volume_vs_wait", title: "ED visits and bed waits", question: "Do days with more ED visits come with longer bed waits?" },
  { type: "monthly_yoy", title: "Year on year", question: "Do months with more ED visits than a year before also have longer bed waits?" },
  { type: "trend", title: "Rising or falling", question: `Are bed waits rising or falling over the most recent ${TREND_WEEKS} weeks?` },
  { type: "anomaly", title: "Unusual weeks", question: `Was the latest week far outside the hospital's own ${RANGE_WEEKS} weeks before?` },
  { type: "usual_gap", title: "Weeks above usual", question: "Was the latest week well above the hospital's usual level?" },
  { type: "source_gap", title: "NUHS estimates and MOH figures", question: "Does NUHS's estimate match MOH's daily figure?" },
  { type: "access_gap", title: "Areas short of clinics", question: "Which areas have the fewest CDMP clinics for their seniors?" },
];
const group = (type: Insight["type"]) => FINDING_GROUPS.find((g) => g.type === type) as (typeof FINDING_GROUPS)[number];

export type Outcome = "published" | "other_lag" | "not_significant" | "too_small" | "not_computed";

export const OUTCOME_WORD: Record<Outcome, string> = {
  published: "Published",
  other_lag: "Passed; a stronger lag was published",
  not_significant: "Not significant after correction",
  too_small: "Effect too small to publish",
  not_computed: "Could not be computed",
};

/** The engine's reason, in one of five words. */
export function outcomeOf(t: Pick<InsightTest, "outcome">): Outcome {
  const o = t.outcome.toLowerCase();
  if (o === "published") return "published";
  if (o.startsWith("a stronger result")) return "other_lag";
  if (o.startsWith("not significant")) return "not_significant";
  if (o.startsWith("effect below")) return "too_small";
  return "not_computed";
}

export interface LedgerRow {
  key: string;
  entity: string;
  when: string | null;
  value: number;
  low: number | null;
  high: number | null;
  outcome: Outcome;
  pAdjusted: number | null;
  n: number;
  nUnit: string | null;
}

export interface LedgerPanel {
  type: InsightTest["type"];
  title: string;
  question: string;
  /** What the dot is, on the axis. */
  measure: string;
  /** The value that means no difference: the line every range is read against. */
  zero: number;
  /** How to print a value on this panel. */
  digits: number;
  note: string;
  rows: LedgerRow[];
}

type Spec = Omit<LedgerPanel, "rows" | "type" | "title" | "question"> & {
  /** The dot and its range on this panel's scale, or null when the result has nothing to draw. */
  scale: (t: InsightTest) => { value: number; low: number | null; high: number | null } | null;
};

const raw = (t: InsightTest) =>
  t.metric_value == null ? null : { value: t.metric_value, low: t.ci_low ?? null, high: t.ci_high ?? null };

/** The panels, in the Findings page's order. Detectors that are not tests of a pattern (access gap, usual gap) are left out. */
const SPECS: Partial<Record<InsightTest["type"], Spec>> = {
  weekday: {
    measure: "Peak day, times the hospital's own average", zero: 1, digits: 2,
    note: "Each hospital's peak weekday against its own weekly average, so hospitals of every size share one scale.",
    // The peak in hours over the hospital's average in hours: a ratio, as the pooled finding already is (its no-difference line is 1).
    scale: (t) => {
      if (t.metric_value == null || t.ci_null == null || t.ci_null <= 0) return null;
      const r = (v: number | null | undefined) => (v == null ? null : v / (t.ci_null as number));
      return { value: t.metric_value / t.ci_null, low: r(t.ci_low), high: r(t.ci_high) };
    },
  },
  volume_vs_wait: {
    measure: "Correlation (Spearman), after the weekday pattern is removed", zero: 0, digits: 2,
    note: "Three tests a hospital: the wait on the same day, the day after and two days after. At most one a hospital is published.",
    scale: raw,
  },
  monthly_yoy: {
    measure: "Correlation (Spearman) of the two year-on-year changes", zero: 0, digits: 2,
    note: "The full emergency departments together, month by month.",
    scale: raw,
  },
  trend: {
    measure: "Change in bed wait, hours per week", zero: 0, digits: 2,
    note: "A range that crosses 0 means the data can't tell rising from falling.",
    scale: raw,
  },
  anomaly: {
    measure: "How far the latest week is from usual (robust z-score)", zero: 0, digits: 1,
    note: "A check, not a test: no p-value and no range. A week is flagged only when it is far outside the hospital's own history.",
    scale: (t) => (t.effect_size == null ? null : { value: t.effect_size, low: null, high: null }),
  },
};

export const PANEL_ORDER: InsightTest["type"][] = ["weekday", "volume_vs_wait", "monthly_yoy", "trend", "anomaly"];
const WHEN_ORDER = ["on the same day", "the day after", "two days after"];
const ALL = "All hospitals";

/** The panels that have results, rows sorted by hospital (and lag). */
export function ledgerPanels(tests: InsightTest[]): LedgerPanel[] {
  return PANEL_ORDER.flatMap((type) => {
    const spec = SPECS[type];
    if (!spec) return [];
    const rows = tests
      .filter((t) => t.type === type)
      .flatMap((t): LedgerRow[] => {
        const s = spec.scale(t);
        if (!s || !Number.isFinite(s.value)) return [];
        return [{ key: `${t.entity}|${t.when ?? ""}`, entity: t.entity, when: t.when ?? null, ...s, outcome: outcomeOf(t),
                  pAdjusted: t.p_adjusted, n: t.n, nUnit: t.n_unit ?? null }];
      })
      // The pooled result first, then each hospital (by code), each hospital's lags in day order.
      .sort((a, b) => Number(b.entity === ALL) - Number(a.entity === ALL) || a.entity.localeCompare(b.entity)
                      || WHEN_ORDER.indexOf(a.when ?? "") - WHEN_ORDER.indexOf(b.when ?? ""));
    if (!rows.length) return [];
    const { measure, zero, digits, note } = spec;
    return [{ type, title: group(type).title, question: group(type).question, measure, zero, digits, note, rows }];
  });
}

/** The panel's extent: every dot, range end and the no-difference line, with a little room. */
export function panelDomain(p: LedgerPanel): [number, number] {
  const vs = p.rows.flatMap((r) => [r.value, r.low, r.high]).filter((v): v is number => v != null);
  let lo = Math.min(p.zero, ...vs);
  let hi = Math.max(p.zero, ...vs);
  if (hi === lo) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.06;
  return [lo - pad, hi + pad];
}

/** How many results there are, and how many were published, in one sentence. */
export function ledgerTally(tests: InsightTest[]): string {
  const tested = tests.filter((t) => t.p_value != null);
  const passed = tested.filter((t) => ["published", "other_lag"].includes(outcomeOf(t)));
  const checks = tests.length - tested.length;
  const lags = passed.filter((t) => outcomeOf(t) === "other_lag").length;
  return `${tested.length} statistical ${tested.length === 1 ? "test" : "tests"} this week: ${passed.length} passed and ` +
    `${tested.length - passed.length} did not.` +
    (lags ? " Where a hospital passed at more than one lag, only its strongest is published." : "") +
    ` ${checks} more ${checks === 1 ? "result was a check" : "results were checks"} with no test ` +
    "(unusual weeks, weeks above usual and the clinic ranking).";
}
