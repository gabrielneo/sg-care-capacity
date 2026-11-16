import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "./PageHeader";

export interface HubItem {
  href: string;
  title: string;
  text: string;
  /** A figure from the page's own data, with its date and source as plain text, outside the link. */
  preview?: { figure: string; provenance: string } | null;
}

/**
 * A section's front page: one card per page in it, each saying what the page is for. `lead` sits between the heading and the cards.
 * A card may preview its page's latest figure (audit G2), dated and sourced once, under a rule.
 * Only the title is a link, and only it is underlined: the description and the figure are plain text (owner's request, 16 Nov 2026).
 */
export function Hub({ title, intro, items, lead }: { title: string; intro: string; items: readonly HubItem[]; lead?: ReactNode }) {
  return (
    <div data-testid="hub">
      <PageHeader title={title} intro={intro} />
      {lead}
      <ul className="card-grid sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <li key={i.href} className="h-full rounded-xl border border-line bg-surface card" data-testid="hub-card">
            <Link href={i.href} className="inline-flex min-h-11 items-center text-h3 font-semibold">{i.title}</Link>
            <p className="mt-1 text-body text-muted">{i.text}</p>
            {i.preview ? (
              <div className="mt-4 border-t border-line pt-3" data-testid="hub-preview">
                <p className="text-small font-semibold text-ink">{i.preview.figure}</p>
                <p className="mt-1 text-meta text-muted" data-testid="hub-preview-provenance">{i.preview.provenance}</p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
