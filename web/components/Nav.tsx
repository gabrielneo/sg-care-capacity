"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isCurrent, NAV_ITEMS } from "@/lib/nav";

/** Top navigation. On narrow screens it wraps onto a second row: every section stays visible, with no menu button, script or sideways scroll. */
export function Nav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav aria-label="Main" className="-mx-2 sm:-mx-3">
      <ul className="flex flex-wrap gap-x-0.5 py-1 sm:gap-1">
        {NAV_ITEMS.map((item) => {
          const current = isCurrent(pathname, item.href, item.children);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-md px-2 text-sm sm:px-3 font-medium no-underline ${
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
