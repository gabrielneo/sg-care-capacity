import { type Level, LEVELS } from "@/lib/status";

const BADGE = {
  much: "border-status-much/30 bg-status-much-soft text-status-much",
  higher: "border-status-higher/30 bg-status-higher-soft text-status-higher",
  usual: "border-status-usual/30 bg-status-usual-soft text-status-usual",
  lower: "border-status-lower/30 bg-status-lower-soft text-status-lower",
  none: "border-line bg-page text-muted",
} as const;

/**
 * A hospital's status against its usual level: a shape, the words and the status fill and colour, never colour alone (lib/status.ts).
 * `plain` is the larger public-view size; the shape and the words (the status scale's own labels) are the same everywhere.
 */
export function StatusBadge({ level, plain = false }: { level: Level; plain?: boolean }) {
  const info = LEVELS[level];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border ${plain ? "px-3 py-1 text-body" : "shrink-0 px-2 py-1 text-meta"} font-semibold ${BADGE[info.tone]}`}
          data-testid="status-badge">
      <span aria-hidden="true">{info.icon}</span>
      {info.label}
    </span>
  );
}
