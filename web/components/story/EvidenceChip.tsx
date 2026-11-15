import { EVIDENCE_LABEL, type EvidenceLevel } from "@/lib/evidence";

/** A shape and a short word per level, so the level is never colour alone. Evidence is not status: neutral tokens only. */
const CHIP: Record<EvidenceLevel, { symbol: string; word: string }> = {
  observed: { symbol: "○", word: "Observed" },
  tested: { symbol: "◐", word: "Tested" },
  robust: { symbol: "●", word: "Tested, robust" },
  "association-only": { symbol: "↔", word: "Association only" },
};

/** How strong a finding's evidence is: symbol + word, with the full sentence as its title and for screen readers. */
export function EvidenceChip({ level }: { level: EvidenceLevel }) {
  const { symbol, word } = CHIP[level];
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-control bg-sunken px-2 py-1 text-meta font-semibold text-ink"
          title={EVIDENCE_LABEL[level]} data-testid="evidence-chip" data-level={level}>
      <span aria-hidden="true">{symbol}</span>
      <span>{word}</span>
      <span className="sr-only">: {EVIDENCE_LABEL[level]}</span>
    </span>
  );
}
