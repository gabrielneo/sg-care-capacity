import type { ReactNode } from "react";

/** Layout for a rendered doc: an optional draft banner, a table of contents, and the content. */
export function DocPage({ toc, todos = 0, children, aside }: {
  toc: { id: string; text: string }[];
  todos?: number;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_240px]">
      <article className="doc min-w-0">
        {todos > 0 ? (
          <p role="note" data-testid="draft-banner" className="mb-6 rounded-lg border border-warn/40 bg-warn-soft p-3 text-sm text-warn">
            <strong>Draft:</strong> {todos} {todos === 1 ? "item needs" : "items need"} the author&apos;s own input, marked{" "}
            <strong>TODO(me)</strong> and highlighted below. Nothing in them has been made up to fill the gap.
          </p>
        ) : null}
        {children}
      </article>
      <aside className="order-first lg:order-last">
        <nav aria-label="On this page" className="text-sm lg:sticky lg:top-4">
          <p className="mb-2 font-semibold">On this page</p>
          <ul className="space-y-1">
            {toc.map((h) => (
              <li key={h.id}>
                <a href={`#${h.id}`} className="text-muted no-underline hover:text-ink hover:underline">{h.text}</a>
              </li>
            ))}
          </ul>
          {aside ? <div className="mt-4">{aside}</div> : null}
        </nav>
      </aside>
    </div>
  );
}
