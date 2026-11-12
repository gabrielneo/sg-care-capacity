import Link from "next/link";

import { PageHeader } from "./PageHeader";

export interface HubItem {
  href: string;
  title: string;
  text: string;
}

/** A section's front page: one card per page in it, each saying what the page is for. Static, no data. */
export function Hub({ title, intro, items }: { title: string; intro: string; items: readonly HubItem[] }) {
  return (
    <div data-testid="hub">
      <PageHeader title={title} intro={intro} />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="block h-full rounded-xl border border-line bg-surface p-5 no-underline hover:bg-page">
              <span className="text-lg font-semibold text-ink">{i.title}</span>
              <span className="mt-1 block text-base text-muted">{i.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
