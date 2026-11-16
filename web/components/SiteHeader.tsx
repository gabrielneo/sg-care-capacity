import Link from "next/link";
import type { ReactNode } from "react";

import { MenuSheet } from "@/components/MenuSheet";
import { Nav } from "@/components/Nav";
import { NAV_ITEMS } from "@/lib/nav";
import { SITE } from "@/lib/site";

/**
 * The site's header, kept quiet so the content leads.
 * - From 1024px: one 64px row (the hairline below included) on the page colour: the name (never wrapped) and, from 1280px, the tagline
 *   (cut with an ellipsis if a wide font leaves no room beside the home page's view switch) at the left,
 *   the five sections in the middle, the view switch at the far right (Home only).
 * - Below 1024px: 56px, the wordmark and a "Menu" button; the sheet holds the navigation, the view choice and the 995 link.
 *   (Until 2026-11-16 the row started at 768px. It never fit there: wordmark, nav, view switch and gaps need about 822px of
 *   the 736 available, so the wordmark wrapped onto three lines, and with Linux's wider fallback font the page scrolled sideways.)
 * `viewbar` is the home page's view switch (the @viewbar slot: a layout can't read ?view=).
 */
export function SiteHeader({ viewbar }: { viewbar: ReactNode }) {
  return (
    <>
      <header className="header-h border-b border-line bg-page" data-testid="site-header">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-4 lg:grid lg:grid-cols-[auto_1fr_auto] lg:gap-6">
          <Link href="/" className="flex h-full min-h-11 min-w-0 items-center gap-3 text-ink link-quiet" data-testid="wordmark">
            <span className="whitespace-nowrap font-serif text-h3 font-semibold">{SITE.name}</span>
            <span className="hidden min-w-0 truncate text-small text-tertiary xl:inline">{SITE.tagline}</span>
          </Link>
          <div className="hidden h-full justify-self-center lg:block"><Nav /></div>
          {viewbar}
          <MenuSheet />
        </div>
      </header>
      {/* Without JavaScript the Menu button can't open the sheet: the same links, in the page. */}
      <noscript>
        <nav aria-label="Main (no script)" className="border-b border-line bg-page px-4 py-2 lg:hidden">
          <ul className="flex flex-wrap gap-x-4">
            {NAV_ITEMS.map((i) => <li key={i.href}><Link href={i.href} className="inline-flex min-h-11 items-center">{i.label}</Link></li>)}
          </ul>
        </nav>
      </noscript>
    </>
  );
}
