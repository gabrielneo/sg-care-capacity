export interface NavItem {
  href: string;
  label: string;
  /** Pages that belong to this section (reached from its hub page): the section is marked current on them too. */
  children?: readonly string[];
}

/**
 * Five sections. About holds the project page, "How it's built" and the case study (each keeps its own address);
 * Methods holds the methodology and the pages that check it; Explore holds the data pages.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/findings", label: "Findings" },
  { href: "/explore", label: "Explore", children: ["/ed-trends", "/access-map", "/live"] },
  { href: "/methodology", label: "Methods", children: ["/data-quality", "/glossary", "/decisions", "/docs"] },
  { href: "/about", label: "About", children: ["/project", "/how-its-built", "/case-study"] },
];

const under = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export function isCurrent(pathname: string, href: string, children: readonly string[] = []): boolean {
  return href === "/" ? pathname === "/" : under(pathname, href) || children.some((c) => under(pathname, c));
}
