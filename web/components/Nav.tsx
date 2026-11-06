"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isCurrent, NAV_ITEMS } from "@/lib/nav";

/** Top navigation. On narrow screens it scrolls sideways, so no menu button or script is needed. */
export function Nav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav aria-label="Main" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex min-w-max gap-1 py-2">
        {NAV_ITEMS.map((item) => {
          const current = isCurrent(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-md px-3 text-sm font-medium no-underline ${
                  current ? "bg-accent-soft text-accent-strong" : "text-muted hover:bg-page hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
