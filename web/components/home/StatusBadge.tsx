import { type Level, LEVELS } from "@/lib/status";

const BADGE = {
  much: "border-status-much/30 bg-status-much-soft text-status-much",
  higher: "border-status-higher/30 bg-status-higher-soft text-status-higher",
  usual: "border-status-usual/30 bg-status-usual-soft text-status-usual",
  lower: "border-status-lower/30 bg-status-lower-soft text-status-lower",
  none: "border-line bg-page text-muted",
} as const;

/**
 * A hospital's status against its usual level: a shape, the words and a colour, never colour alone (lib/status.ts).
 * `quiet` (the dense Planner and Analyst cards) leaves "about usual" and "lower" grey, so only the
 * hospitals above usual carry a colour. `plain` uses the public view's words ("Busier than usual for this hospital"). The shape and the words are the same either way.
 */
export function StatusBadge({ level, quiet = false, plain = false }: { level: Level; quiet?: boolean; plain?: boolean }) {
  const info = LEVELS[level];
  const tone = quiet && (info.tone === "usual" || info.tone === "lower") ? "none" : info.tone;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border ${plain ? "px-3 py-1 text-base" : "shrink-0 px-2 py-0.5 text-xs"} font-medium ${BADGE[tone]}`}
          data-testid="status-badge">
      <span aria-hidden="true">{info.icon}</span>
      {plain ? info.plain : info.label}
    </span>
  );
}
