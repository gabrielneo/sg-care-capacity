import Link from "next/link";
import type { ReactNode } from "react";

import type { Meta } from "@/lib/api/types";
import { formatAsOf } from "@/lib/dates";
import { cadenceOf } from "@/lib/freshness";

import { FreshnessBadge } from "./FreshnessBadge";
import { Prose } from "./Prose";
import { publishers } from "./Provenance";
import { Glossed } from "./terms/Glossed";
import { Tip } from "./terms/TermView";

/**
 * The header of every data section, one shape everywhere (docs/design/redesign_brief.md):
 *   Row 1: the heading, which asks the section's one question .......... freshness pill
 *   Row 2: the lede, one sentence (at most 68 characters wide)  [aside: a sort control or a small inline chart]
 *   Row 3: "{window} · Source: {sources} · Data as of {date}" and "How this is measured"
 * Row 3 is the ONLY place the date and source appear for the section. Everything inside it inherits them; a child shows
 * its own tag only when its provenance differs (lib/sectionMeta.ts, childMeta).
 * `actions` (a control for the section, such as its order) sits at the right of row 1 from 768px and below the lede on a phone.
 * `measure` is the popover behind "How this is measured", or `measureLabel` (the definitions this section uses); without it the link goes to the methodology.
 */
export function SectionHeader({ id, title, lede, ledeTestId, meta, window, measure, measureLabel = "How this is measured", aside, actions, now, testId }: {
  id: string; title: ReactNode; lede?: ReactNode; ledeTestId?: string; meta: Meta; window?: string | null;
  measure?: ReactNode; measureLabel?: string; aside?: ReactNode; actions?: ReactNode; now?: Date; testId?: string;
}) {
  const live = meta.sources.length > 0 && meta.sources.every((s) => cadenceOf(s.id) === "moment");
  return (
    <header className="section-head" data-actions={actions ? "true" : undefined} data-testid={testId ?? "section-header"}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id={id} className="min-w-0 font-semibold text-ink">{title}</h2>
        <FreshnessBadge meta={meta} now={now} />
      </div>
      {lede || aside ? (
        <div className="lede-row flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          {lede ? <Prose tone="muted" className="lede" data-testid={ledeTestId}>{lede}</Prose> : <span />}
          {aside}
        </div>
      ) : null}
      {actions ? <div className="section-actions">{actions}</div> : null}
      {/* Running text, not a flex row: the link inside is inline, so it needs no 44px box of its own. */}
      <p className="mt-2 text-meta text-tertiary" data-testid="section-meta">
        {window ? <>{window}{" · "}</> : null}
        Source:{" "}
        {publishers(meta.sources).map((p, i) => (
          <span key={p.name} title={p.full}>{i > 0 ? ", " : null}<Glossed text={p.name} /></span>
        ))}
        {" · "}Data as of <time dateTime={meta.as_of}>{formatAsOf(meta.as_of, { withTime: live })}</time>
        {" · "}
        {measure ? <Tip label={measureLabel} data={{ "data-testid": "measure-help" }}>{measure}</Tip>
          : <Link href="/methodology" data-testid="measure-link">{measureLabel}</Link>}
      </p>
    </header>
  );
}
