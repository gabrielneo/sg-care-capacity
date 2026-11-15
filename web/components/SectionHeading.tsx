import type { ReactNode } from "react";

import { Prose } from "./Prose";

/**
 * A section's heading and its lede: the heading asks the section's one question, the lede (text-secondary, one sentence)
 * gives the answer. 8px between them, 24px before the content (--heading-lede, --lede-content).
 * `badge` sits beside the heading (a freshness badge); `aside` sits at the far end of the row (a sort control).
 */
export function SectionHeading({ id, as: Tag = "h2", lede, ledeTestId, badge, aside, children }: {
  id?: string; as?: "h2" | "h3"; lede?: ReactNode; ledeTestId?: string; badge?: ReactNode; aside?: ReactNode; children: ReactNode;
}) {
  return (
    <header className="section-head">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Tag id={id} className="font-semibold text-ink">{children}</Tag>
            {badge}
          </div>
          {lede ? <Prose tone="muted" className="lede" data-testid={ledeTestId}>{lede}</Prose> : null}
        </div>
        {aside}
      </div>
    </header>
  );
}
