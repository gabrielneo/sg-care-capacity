import { type Level, LEVELS } from "@/lib/status";

const BADGE = {
  bad: "border-bad/30 bg-bad-soft text-bad",
  warn: "border-warn/30 bg-warn-soft text-warn",
  ok: "border-ok/30 bg-ok-soft text-ok",
  none: "border-line bg-page text-muted",
} as const;

/**
 * A hospital's status against its usual level: a shape, the words and a colour, never colour alone (lib/status.ts).
 * `quiet` (the dense Planner and Analyst cards) leaves "about usual" and "lower" grey, so only the
 * hospitals above usual carry a colour. `plain` uses the public view's words ("Busier than usual for this hospital"). The shape and the words are the same either way.
 */
export function StatusBadge({ level, quiet = false, plain = false }: { level: Level; quiet?: boolean; plain?: boolean }) {
  const info = LEVELS[level];
  const tone = quiet && info.tone === "ok" ? "none" : info.tone;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border ${plain ? "px-3 py-1 text-base" : "shrink-0 px-2 py-0.5 text-xs"} font-medium ${BADGE[tone]}`}
          data-testid="status-badge">
      <span aria-hidden="true">{info.icon}</span>
      {plain ? info.plain : info.label}
    </span>
  );
}
