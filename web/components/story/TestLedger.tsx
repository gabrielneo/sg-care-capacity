import Link from "next/link";

import type { Hospital, InsightTest, Meta } from "@/lib/api/types";
import { isUrgentCare, shortName } from "@/lib/hospitals";
import { findingMeta } from "@/lib/provenance";
import { type LedgerPanel, type LedgerRow, OUTCOME_WORD, ledgerPanels, ledgerTally, panelDomain } from "@/lib/testLedger";

import { ChartFrame } from "../ChartFrame";

const PASSED = new Set(["published", "other_lag"]);

function label(r: LedgerRow, names: Map<string, string>): string {
  const name = names.get(r.entity) ?? r.entity;
  return r.when ? `${name}, ${r.when}` : name;
}

const fmt = (v: number, digits: number) =>
  `${v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("en-SG", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

/** One panel: a row per result, its 95% range as a bar and its value as a dot. Filled = passed, hollow = did not (shape, not colour). */
function Panel({ panel, names }: { panel: LedgerPanel; names: Map<string, string> }) {
  const [lo, hi] = panelDomain(panel);
  const pos = (v: number) => (100 * (v - lo)) / (hi - lo);
  const GRID = "grid gap-x-4 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[15rem_minmax(0,1fr)_14rem]";
  return (
    <div className="mt-8" data-testid="ledger-panel" data-type={panel.type}>
      <h4 className="font-semibold text-ink text-body">{panel.title}</h4>
      <p className="max-w-prose text-small text-muted">{panel.question} {panel.note}</p>
      <div className={`${GRID} mt-3 px-2`} aria-hidden="true">
        <span className="text-meta text-muted sm:col-span-2 lg:col-span-1">{panel.measure}</span>
        <span className="relative block h-5 text-meta tabular-nums text-muted sm:col-span-2 lg:col-span-1">
          <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap" style={{ left: `${pos(panel.zero)}%` }}>
            {fmt(panel.zero, panel.type === "weekday" ? 1 : 0)} = no difference
          </span>
        </span>
      </div>
      <ul aria-hidden="true">
        {panel.rows.map((r) => {
          const passed = PASSED.has(r.outcome);
          return (
            <li key={r.key} className={`${GRID} items-center rounded-md px-2 py-1 hover:bg-sunken`} data-testid="ledger-row"
                data-outcome={r.outcome}>
              <span className="min-w-0 text-small text-ink lg:truncate">{label(r, names)}</span>
              <span className="relative block h-6 sm:col-span-2 sm:row-start-2 lg:col-span-1 lg:col-start-2 lg:row-start-1">
                <span className="absolute inset-y-0 w-px bg-ink" style={{ left: `${pos(panel.zero)}%` }} />
                {r.low != null && r.high != null ? (
                  <span className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-control"
                        style={{ left: `${pos(r.low)}%`, width: `${Math.max(0.5, pos(r.high) - pos(r.low))}%` }} />
                ) : null}
                <span className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-data-mark ${passed ? "bg-data-mark" : "bg-surface"}`}
                      style={{ left: `${pos(r.value)}%` }} />
              </span>
              <span className="text-meta text-muted sm:col-start-2 sm:row-start-1 sm:text-right lg:col-start-3 lg:text-left">
                <span className="tabular-nums text-ink">{fmt(r.value, panel.digits)}</span>
                {" · "}{OUTCOME_WORD[r.outcome]}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The same results as a table, for "Show as table" and screen readers. */
function LedgerTable({ panels, names }: { panels: LedgerPanel[]; names: Map<string, string> }) {
  return (
    <table className="w-full text-left text-small">
      <thead>
        <tr><th scope="col">Question</th><th scope="col">Hospital</th><th scope="col">Value</th><th scope="col">95% range</th>
          <th scope="col">Adjusted p</th><th scope="col">n</th><th scope="col">Outcome</th></tr>
      </thead>
      <tbody>
        {panels.flatMap((p) => p.rows.map((r) => (
          <tr key={`${p.type}|${r.key}`}>
            <td>{p.title}</td>
            <td>{label(r, names)}</td>
            <td className="tabular-nums">{fmt(r.value, p.digits)}</td>
            <td className="tabular-nums">{r.low != null && r.high != null ? `${fmt(r.low, p.digits)} to ${fmt(r.high, p.digits)}` : "none"}</td>
            <td className="tabular-nums">{r.pAdjusted != null ? r.pAdjusted.toPrecision(2) : "no test"}</td>
            <td className="tabular-nums">{r.n.toLocaleString("en-SG")}{r.nUnit ? ` ${r.nUnit}` : ""}</td>
            <td>{OUTCOME_WORD[r.outcome]}</td>
          </tr>
        )))}
      </tbody>
    </table>
  );
}

/**
 * Every test the engine ran this week, including the ones that found nothing: a reader sees what was looked for, not only what
 * was found. The numbers are the engine's (GET /api/v1/insights/tests).
 */
export function TestLedger({ tests, meta, hospitals }: { tests: InsightTest[]; meta: Meta; hospitals: Hospital[] }) {
  const panels = ledgerPanels(tests);
  if (!panels.length) return null;
  // Dated and credited by the tests drawn, with only the warnings on their tables (the clinic ranking isn't drawn here).
  const drawn = tests.filter((t) => panels.some((p) => p.type === t.type));
  const own = findingMeta({ source_ids: [...new Set(drawn.flatMap((t) => t.source_ids ?? []))],
                            dq_tables: [...new Set(drawn.flatMap((t) => t.dq_tables ?? []))], as_of: meta.as_of }, meta);
  // The urgent care centre is named as one, so its row is never read as a full ED's (ADR 0012).
  const names = new Map(hospitals.map((h) => [h.hospital_code, isUrgentCare(h) ? `${shortName(h)} (urgent care centre)` : shortName(h)]));
  return (
    <section aria-labelledby="tests" className="section" data-testid="test-ledger">
      <h2 id="tests" className="font-semibold text-ink text-h2">Every test run, including the ones that found nothing</h2>
      <p className="mt-2 max-w-prose text-ink" data-testid="ledger-tally">{ledgerTally(tests)}</p>
      <p className="mt-2 max-w-prose text-small text-muted">
        Each dot is one result, and its bar is the 95% range. A filled dot passed its test; a hollow one did not. A range that
        crosses the no-difference line is one the data can&apos;t tell from no difference.{" "}
        <Link href="/docs/insights-method">How findings are tested</Link>
      </p>
      <div className="mt-6">
        <ChartFrame title="Every test the insight engine ran this week, with its 95% range" slug="test-ledger" headingLevel={3} meta={own}
                    csv="/export/tests.csv?context=1" table={<LedgerTable panels={panels} names={names} />}
                    summary={`One row per result in ${panels.length} groups: its value, its 95% range where the method gives one, and whether it passed its test.`}>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-muted" data-testid="ledger-legend">
            <li className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 rounded-full border-2 border-data-mark bg-data-mark" />Passed</li>
            <li className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 rounded-full border-2 border-data-mark bg-surface" />Did not pass</li>
            <li className="flex items-center gap-2"><span aria-hidden="true" className="h-0.5 w-5 bg-control" />95% range</li>
          </ul>
          {panels.map((p) => <Panel key={p.type} panel={p} names={names} />)}
        </ChartFrame>
      </div>
    </section>
  );
}
