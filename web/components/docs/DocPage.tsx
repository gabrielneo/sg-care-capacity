import type { ReactNode } from "react";

import { JumpMenu } from "@/components/JumpMenu";
import { OnThisPage } from "@/components/OnThisPage";

/** Layout for a rendered doc: an optional draft banner, a table of contents, and the content. */
export function DocPage({ toc, todos = 0, children, aside }: {
  toc: { id: string; text: string }[];
  todos?: number;
  children: ReactNode;
  aside?: ReactNode;
}) {
  const items = toc.map((h) => ({ id: h.id, label: h.text }));
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_240px]">
      <article className="doc min-w-0">
        {todos > 0 ? (
          <p role="note" data-testid="draft-banner" className="mb-6 rounded-lg border border-status-higher/40 bg-status-higher-soft p-3 text-small text-status-higher">
            <strong>Draft:</strong> {todos} {todos === 1 ? "item needs" : "items need"} the author&apos;s own input, marked{" "}
            <strong>TODO(me)</strong> and highlighted below. Nothing in them has been made up to fill the gap.
          </p>
        ) : null}
        {children}
      </article>
      <aside className="order-first lg:order-last">
        {/* Below 1024px a "Jump to section" menu; from 1024px the sticky list with the section in view marked. */}
        <JumpMenu items={items} className="lg:hidden" />
        <div className="hidden lg:sticky lg:top-4 lg:block">
          <OnThisPage items={items} />
          {aside ? <div className="mt-4 text-small">{aside}</div> : null}
        </div>
        {aside ? <div className="mt-4 text-small lg:hidden">{aside}</div> : null}
      </aside>
    </div>
  );
}
