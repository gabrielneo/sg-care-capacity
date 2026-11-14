import type { Meta } from "@/lib/api/types";
import { type Freshness, freshnessText, type Level, metaFreshness, ruleText } from "@/lib/freshness";

export const LEVEL_STYLE: Record<Level, string> = {
  up_to_date: "bg-status-usual-soft text-status-usual border-status-usual/30",
  due: "bg-status-higher-soft text-status-higher border-status-higher/30",
  overdue: "bg-status-much-soft text-status-much border-status-much/30",
  unknown: "bg-page text-muted border-line",
};

/** The label for an old list that is still the newest published. */
export const LATEST_PUBLISHED = "Latest published";

/** A shape per level, so the status is never colour alone. */
export const LEVEL_SYMBOL: Record<Level, string> = { up_to_date: "✓", due: "!", overdue: "✕", unknown: "?" };

/**
 * Up to date / Due an update / Overdue, with the cadence and the as-of date, always in words (never
 * colour alone). Give it the figure's `meta` (each source judged by its own rule in docs/datasets.yml;
 * the badge shows the least fresh, so a combined figure inherits it) or a computed `freshness`.
 * `source` names the publisher when a figure shows one badge per source.
 */
export function FreshnessBadge({ meta, freshness, now, source }: {
  meta?: Pick<Meta, "sources">; freshness?: Freshness | null; now?: Date; source?: string }) {
  const f = freshness !== undefined ? freshness : meta ? metaFreshness(meta, now) : null;
  if (!f) return null;
  // A list that is only updated now and then and is simply old (the CHAS clinic list) is the newest one there is: say so, in
  // neutral colours, not as an alarm. The Data Quality page still reports the real level; this is only how the badge looks.
  const latestOnly = f.cadence === "irregular" && f.level === "overdue";
  const text = latestOnly ? freshnessText({ ...f, label: LATEST_PUBLISHED }) : freshnessText(f);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${LEVEL_STYLE[latestOnly ? "unknown" : f.level]}`}
      title={`${f.age ? `${f.age} old. ` : ""}${ruleText(f.sourceId)}`}
      data-level={f.level}
      data-testid="freshness-badge"
    >
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
      {source ? `${source}: ` : null}{text}
    </span>
  );
}
