"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isCurrent, NAV_ITEMS } from "@/lib/nav";

/**
 * The site's navigation, in one component with two layouts:
 * - "bar": the header's row from 1024px. The current page is royal-blue text with a 2px royal-blue underline (no filled pill),
 *   and the link fills the header's height, so the underline sits on the header's bottom border.
 * - "sheet": a column of full-width rows inside the phone's menu sheet (components/MenuSheet.tsx).
 * `onNavigate` lets the sheet close itself when a link is followed.
 */
export function Nav({ variant = "bar", onNavigate }: { variant?: "bar" | "sheet"; onNavigate?: () => void }) {
  const pathname = usePathname() ?? "/";
  const bar = variant === "bar";
  return (
    <nav aria-label={bar ? "Main" : "Menu"} className={bar ? "hidden h-full lg:block" : ""} data-testid={bar ? "nav-bar" : "nav-sheet"}>
      <ul className={bar ? "flex h-full items-stretch gap-1 lg:gap-4" : "flex flex-col"}>
        {NAV_ITEMS.map((item) => {
          const current = isCurrent(pathname, item.href, item.children);
          return (
            <li key={item.href} className={bar ? "flex" : "border-b border-line"}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                onClick={onNavigate}
                className={bar
                  ? `flex items-center border-b-2 px-2 text-small font-semibold link-quiet lg:px-3 ${
                      current ? "border-primary text-primary-text" : "border-transparent text-muted hover:text-ink"}`
                  : `flex min-h-11 items-center text-body font-semibold link-quiet ${current ? "text-primary-text" : "text-ink"}`}
              >
                {item.label}
                {!bar && current ? <span className="sr-only"> (current page)</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
