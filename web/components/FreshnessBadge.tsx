import type { Meta } from "@/lib/api/types";
import { formatAsOf } from "@/lib/dates";
import { type Freshness, freshnessText, type Level, metaFreshness, ruleText } from "@/lib/freshness";

/**
 * No fill: the border (solid, dashed or heavy) and the symbol carry the level, and a fill that is one shade off the page was a
 * background colour more for no meaning (review N6).
 * Freshness is not status: it never uses the status colours (brick, amber, violet) and has its own square-cornered
 * shape. The level shows as a symbol, words and the border: solid when up to date, dashed when due, heavy when overdue (audit L5).
 */
export const LEVEL_STYLE: Record<Level, string> = {
  up_to_date: "rounded-sm border-control text-ink",
  due: "rounded-sm border-dashed border-control text-ink",
  overdue: "rounded-sm border-2 border-ink font-semibold text-ink",
  unknown: "rounded-sm border-line text-muted",
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
 * `dateInLine`: the badge sits beside a line that already gives the date, so the badge leaves it out (it stays in the
 * tooltip). The date is stated once (review, open item 5: the date block under each chart).
 */
export function FreshnessBadge({ meta, freshness, now, source, dateInLine = false }: {
  meta?: Pick<Meta, "sources">; freshness?: Freshness | null; now?: Date; source?: string; dateInLine?: boolean }) {
  const f = freshness !== undefined ? freshness : meta ? metaFreshness(meta, now) : null;
  if (!f) return null;
  // A list that is only updated now and then and is simply old (the CHAS clinic list) is the newest one there is: say so, in
  // neutral colours, not as an alarm. The Data Quality page still reports the real level; this is only how the badge looks.
  const latestOnly = f.cadence === "irregular" && f.level === "overdue";
  const opts = { withDate: !dateInLine };
  const text = latestOnly ? freshnessText({ ...f, label: LATEST_PUBLISHED }, opts) : freshnessText(f, opts);
  const asOf = f.level === "unknown" ? "" : `As of ${formatAsOf(f.asOf, { withTime: f.cadence === "moment" })}. `;
  return (
    <span
      className={`inline-flex items-center gap-2 border px-2 py-1 text-meta font-semibold ${LEVEL_STYLE[latestOnly ? "unknown" : f.level]}`}
      title={`${dateInLine ? asOf : ""}${f.age ? `${f.age} old. ` : ""}${ruleText(f.sourceId)}`}
      data-level={f.level}
      data-testid="freshness-badge"
    >
      <span aria-hidden="true" className="h-2 w-2 bg-current" />
      {source ? `${source}: ` : null}{text}
    </span>
  );
}
