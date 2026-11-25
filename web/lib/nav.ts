export interface NavItem {
  href: string;
  label: string;
  /** Pages that belong to this section (reached from its hub page): the section is marked current on them too. */
  children?: readonly string[];
}

/**
 * Five sections. About holds the project page and the case study (each keeps its own address; /how-its-built redirects to Methods);
 * Methods holds the methodology and the pages that check it; Explore holds the data pages.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/findings", label: "Findings" },
  { href: "/explore", label: "Explore", children: ["/find", "/ed-trends", "/hospital", "/access-map", "/live"] },
  { href: "/methodology", label: "Methods", children: ["/data-quality", "/glossary", "/decisions", "/docs"] },
  { href: "/about", label: "About", children: ["/project", "/case-study"] },
];

const under = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export function isCurrent(pathname: string, href: string, children: readonly string[] = []): boolean {
  return href === "/" ? pathname === "/" : under(pathname, href) || children.some((c) => under(pathname, c));
}
