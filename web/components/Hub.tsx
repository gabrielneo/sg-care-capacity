import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "./PageHeader";

export interface HubItem {
  href: string;
  title: string;
  text: string;
  /** A figure from the page's own data, with its date and source as plain text (the card is one link). */
  preview?: { figure: string; provenance: string } | null;
}

/**
 * A section's front page: one card per page in it, each saying what the page is for. `lead` sits between the heading and the cards.
 * A card may preview its page's latest figure (audit G2), dated and sourced once, under a rule.
 */
export function Hub({ title, intro, items, lead }: { title: string; intro: string; items: readonly HubItem[]; lead?: ReactNode }) {
  return (
    <div data-testid="hub">
      <PageHeader title={title} intro={intro} />
      {lead}
      <ul className="card-grid sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="block h-full rounded-xl border border-line bg-surface card link-quiet hover:bg-page">
              <span className="text-h3 font-semibold text-ink">{i.title}</span>
              <span className="mt-1 block text-body text-muted">{i.text}</span>
              {i.preview ? (
                <span className="mt-4 block border-t border-line pt-3" data-testid="hub-preview">
                  <span className="block text-small font-semibold text-ink">{i.preview.figure}</span>
                  <span className="mt-1 block text-meta text-muted" data-testid="hub-preview-provenance">{i.preview.provenance}</span>
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
