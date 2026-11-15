import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "./PageHeader";

export interface HubItem {
  href: string;
  title: string;
  text: string;
}

/** A section's front page: one card per page in it, each saying what the page is for. `lead` sits between the heading and the cards. Static, no data. */
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
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
