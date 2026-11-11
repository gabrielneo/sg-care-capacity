import { type Level, LEVELS } from "@/lib/status";

const BADGE = {
  bad: "border-bad/30 bg-bad-soft text-bad",
  warn: "border-warn/30 bg-warn-soft text-warn",
  ok: "border-ok/30 bg-ok-soft text-ok",
  none: "border-line bg-page text-muted",
} as const;

/** A hospital's status against its usual level: a shape, the words and a colour, never colour alone (lib/status.ts). */
export function StatusBadge({ level }: { level: Level }) {
  const info = LEVELS[level];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${BADGE[info.tone]}`}
          data-testid="status-badge">
      <span aria-hidden="true">{info.icon}</span>
      {info.label}
    </span>
  );
}
