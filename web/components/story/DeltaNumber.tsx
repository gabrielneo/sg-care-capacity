import type { ReactNode } from "react";

import type { InsightDisplay } from "@/lib/api/types";

import { Glossed } from "../terms/Glossed";

export type Direction = "better" | "worse" | "neutral";

/** Colour comes from direction only (more clinics is better, a longer wait is worse); neutral has none. */
const TONE: Record<Direction, string> = { better: "text-ok", worse: "text-bad", neutral: "text-ink" };
const ARROW = { up: "▲", down: "▼" } as const;

export interface DeltaNumberProps {
  value: string;
  unit?: string | null;
  /** What the number is, e.g. "Average bed wait on Tuesdays". */
  label?: ReactNode;
  /** What it is compared with, with its value: shown as "vs {comparison}". */
  comparison?: string | null;
  /** The arrow: which way the number moved. */
  change?: "up" | "down" | null;
  /** The word beside the arrow, e.g. "higher than usual". The arrow is never shown without it. */
  word?: string | null;
  /** From the insight, never from the arrow: a rise in clinics is good, a rise in bed waits is bad. */
  direction: Direction;
}

/**
 * A key number with its comparison. The change is shown as an arrow AND a word, and coloured by
 * direction, so colour never carries the meaning alone (docs/language_rules.md, Rule 5).
 */
export function DeltaNumber({ value, unit, label, comparison, change, word, direction }: DeltaNumberProps) {
  return (
    <div data-testid="delta-number" data-direction={direction} className="my-3">
      {label ? <p className="text-sm text-muted">{label}</p> : null}
      <p className="text-ink">
        <span className="text-3xl font-semibold tabular-nums">{value}</span>
        {unit ? <>{" "}<span className="text-base text-muted">{unit}</span></> : null}
      </p>
      {word ? (
        <p className={`text-sm font-medium ${TONE[direction]}`} data-testid="delta-change">
          {change ? <span aria-hidden="true">{ARROW[change]} </span> : null}
          <Glossed text={word} />
          {direction !== "neutral" ? <span className="sr-only"> ({direction === "worse" ? "worse" : "better"})</span> : null}
        </p>
      ) : null}
      {comparison ? (
        <p className="text-sm text-muted">
          vs <Glossed text={comparison} />
        </p>
      ) : null}
    </div>
  );
}

/** The props for an insight's key number, straight from its display fields. */
export function deltaFromDisplay(display: InsightDisplay, direction: Direction): DeltaNumberProps {
  return {
    value: display.value_text,
    unit: display.unit_text,
    label: <Glossed text={display.metric_label} />,
    comparison: display.comparison_label,
    change: display.change,
    word: display.change_word,
    direction,
  };
}
