import Link from "next/link";
import type { ReactNode } from "react";

import { MenuSheet } from "@/components/MenuSheet";
import { Nav } from "@/components/Nav";
import { NAV_ITEMS } from "@/lib/nav";
import { SITE } from "@/lib/site";

/**
 * The site's header, kept quiet so the content leads.
 * - From 768px: one 64px row (the hairline below included) on the page colour: wordmark and tagline (the tagline from 1024px) at the left,
 *   the five sections in the middle, the view switch at the far right (Home only).
 * - Below 768px: 56px, the wordmark and a "Menu" button; the sheet holds the navigation, the view choice and the 995 link.
 * `viewbar` is the home page's view switch (the @viewbar slot: a layout can't read ?view=).
 */
export function SiteHeader({ viewbar }: { viewbar: ReactNode }) {
  return (
    <>
      <header className="header-h border-b border-line bg-page" data-testid="site-header">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-4 md:grid md:grid-cols-[auto_1fr_auto] md:gap-6">
          <Link href="/" className="flex h-full min-h-11 items-center gap-3 text-ink link-quiet" data-testid="wordmark">
            <span className="font-serif text-h3 font-semibold">{SITE.name}</span>
            <span className="hidden text-small text-tertiary lg:inline">{SITE.tagline}</span>
          </Link>
          <div className="hidden h-full justify-self-center md:block"><Nav /></div>
          {viewbar}
          <MenuSheet />
        </div>
      </header>
      {/* Without JavaScript the Menu button can't open the sheet: the same links, in the page. */}
      <noscript>
        <nav aria-label="Main (no script)" className="border-b border-line bg-page px-4 py-2 md:hidden">
          <ul className="flex flex-wrap gap-x-4">
            {NAV_ITEMS.map((i) => <li key={i.href}><Link href={i.href} className="inline-flex min-h-11 items-center">{i.label}</Link></li>)}
          </ul>
        </nav>
      </noscript>
    </>
  );
}
