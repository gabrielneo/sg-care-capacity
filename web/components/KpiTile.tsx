import type { ReactNode } from "react";

import type { Meta } from "@/lib/api/types";
import type { Cadence } from "@/lib/freshness";

import { CaveatChip } from "./CaveatChip";
import { Provenance, provenanceProblems } from "./Provenance";
import { ErrorState } from "./States";
import { Glossed } from "./terms/Glossed";

export interface KpiChange {
  /** Signed change, e.g. 12.5 for +12.5%. null = no comparison possible. */
  value: number | null;
  unit?: string;
  /** What it is compared with, e.g. "vs the previous 4-week average". */
  label: string;
}

export interface KpiTileProps {
  label: ReactNode;
  value: number | null;
  unit?: ReactNode;
  /** Required: the response's meta (as_of and source are always shown). */
  meta: Meta;
  format?: (value: number) => string;
  change?: KpiChange;
  caveat?: string;
  cadence?: Cadence;
  now?: Date;
  /** The date is the data release's (labelled so, no badge). See Provenance. */
  release?: boolean;
  /** What the number belongs to or is drawn from (a hospital's name, a small line), under the number. */
  detail?: ReactNode;
  /** false: the date and source without the freshness badge, for a row of tiles that shows one badge for them all. */
  freshness?: boolean;
  /** A tighter tile, for dense strips. */
  dense?: boolean;
}

const defaultFormat = (v: number) => v.toLocaleString("en-SG", { maximumFractionDigits: 1 });

function ChangeLine({ change }: { change: KpiChange }) {
  if (change.value === null) {
    return <p className="mt-1 text-sm text-muted">No comparison available {change.label}</p>;
  }
  // Neutral on purpose: whether a rise is good depends on the measure, so no red/green here.
  const arrow = change.value > 0 ? "▲" : change.value < 0 ? "▼" : "■";
  const sign = change.value > 0 ? "+" : "";
  const text = `${sign}${change.value.toLocaleString("en-SG", { maximumFractionDigits: 1 })}${change.unit ?? ""}`;
  return (
    <p className="mt-1 text-sm text-muted">
      <span aria-hidden="true">{arrow} </span>
      <span className="font-medium text-ink">{text}</span> {change.label}
    </p>
  );
}

/** One headline number with its unit, change and provenance. Missing is shown as missing, never 0. */
export function KpiTile({ label, value, unit, meta, format = defaultFormat, change, caveat, cadence, now, release, detail, freshness = true, dense = false }: KpiTileProps) {
  const problems = provenanceProblems(meta);
  return (
    <div data-testid="kpi-tile" className={`h-full rounded-lg border border-line bg-surface shadow-sm ${dense ? "p-3" : "p-4"}`}>
      <p className="text-sm font-medium text-muted">{label}</p>
      {problems.length ? (
        <div className="mt-2">
          <ErrorState title="Can't be shown" error={{ message: `The figure can't be shown because ${problems.join(" and ")}.` }} />
        </div>
      ) : (
        <>
          <p className={`mt-1 font-semibold tabular-nums text-ink ${dense ? "text-2xl" : "text-3xl"}`}>
            {value === null ? (
              <>
                <span aria-hidden="true">—</span>
                <span className="sr-only">No data</span>
              </>
            ) : (
              format(value)
            )}
            {value !== null && unit ? <>{" "}<span className="text-base font-normal text-muted">{unit}</span></> : null}
          </p>
          {detail ? <div className="mt-1 text-sm text-muted" data-testid="kpi-detail">{detail}</div> : null}
          {change ? <ChangeLine change={change} /> : null}
          {caveat ? (
            <div className="mt-2">
              <CaveatChip><Glossed text={caveat} /></CaveatChip>
            </div>
          ) : null}
          <Provenance meta={meta} cadence={cadence} now={now} compact release={release} freshness={freshness} tight={dense} />
        </>
      )}
    </div>
  );
}
