import Link from "next/link";

import type { QualityReport } from "@/lib/api/types";
import { checkHref } from "@/lib/checkAnchors";

type Result = QualityReport["results"][number];

const STATUS: Record<Result["status"], { label: string; icon: string; cls: string }> = {
  pass: { label: "Passed", icon: "✓", cls: "text-ok" },
  fail: { label: "Failed", icon: "✕", cls: "text-bad" },
  skipped: { label: "Skipped", icon: "–", cls: "text-muted" },
};

const GROUPS: { key: string; title: string; text: string; match: (r: Result) => boolean }[] = [
  { key: "blocking", title: "Errors that block publishing", match: (r) => r.severity === "ERROR" && r.blocks_publish,
    text: "If any of these fails, nothing is published and the site keeps the previous snapshot." },
  { key: "quarantine", title: "Errors that quarantine rows", match: (r) => r.severity === "ERROR" && !r.blocks_publish,
    text: "A failing row is set aside with its reason, never corrected, and left out of the figures." },
  { key: "warn", title: "Warnings", match: (r) => r.severity === "WARN",
    text: "Published, with the warning shown next to the affected figures." },
];

const order = (r: Result) => (r.status === "fail" ? 0 : r.status === "skipped" ? 1 : 2);

function ResultTable({ rows, label }: { rows: Result[]; label: string }) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${label} (scrolls sideways)`}>
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="py-1.5 pr-3 font-semibold">Check</th>
            <th scope="col" className="py-1.5 pr-3 font-semibold">Table</th>
            <th scope="col" className="py-1.5 pr-3 font-semibold">Result</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-semibold">Rows</th>
            <th scope="col" className="py-1.5 font-semibold">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = STATUS[r.status];
            return (
              <tr key={`${r.check_id}|${r.table}`} className="border-b border-line align-top" data-status={r.status}>
                <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                  <Link href={checkHref(r.check_id)} className="font-mono text-xs">{r.check_id}</Link>
                </th>
                <td className="py-1.5 pr-3 font-mono text-xs">{r.table}</td>
                <td className={`whitespace-nowrap py-1.5 pr-3 font-medium ${s.cls}`}>
                  <span aria-hidden="true">{s.icon} </span>{s.label}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{r.status === "fail" ? r.failing_rows.toLocaleString("en-SG") : ""}</td>
                <td className="py-1.5 text-xs text-muted">
                  {r.details && r.details.length > 120 ? (
                    <details>
                      <summary className="cursor-pointer">{r.details.slice(0, 100)}…</summary>
                      <p className="mt-1 break-words">{r.details}</p>
                    </details>
                  ) : (
                    r.details
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Failures and skips first, in full; passed checks folded away so the few that matter stand out. */
export function CheckResults({ report }: { report: QualityReport }) {
  return (
    <div className="space-y-8">
      {GROUPS.map((g) => {
        const rows = report.results.filter(g.match).sort((a, b) => order(a) - order(b) || a.check_id.localeCompare(b.check_id));
        const attention = rows.filter((r) => r.status !== "pass");
        const passed = rows.filter((r) => r.status === "pass");
        const failed = rows.filter((r) => r.status === "fail").length;
        return (
          <section key={g.key} aria-labelledby={`group-${g.key}`} data-testid={`checks-${g.key}`}>
            <h3 id={`group-${g.key}`} className="text-base font-semibold">
              {g.title} <span className="font-normal text-muted">({rows.length} checks, {failed} failed)</span>
            </h3>
            <p className="mb-2 text-sm text-muted">{g.text}</p>
            {attention.length ? (
              <ResultTable rows={attention} label={`${g.title}: failed or skipped`} />
            ) : (
              <p className="text-sm text-ok"><span aria-hidden="true">✓ </span>Every check in this group passed.</p>
            )}
            {passed.length ? (
              <details className="mt-2">
                <summary className="cursor-pointer py-1 text-sm text-accent">Show {passed.length} passed checks</summary>
                <ResultTable rows={passed} label={`${g.title}: passed`} />
              </details>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
