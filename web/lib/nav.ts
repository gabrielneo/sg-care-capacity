export interface NavItem {
  href: string;
  label: string;
  /** Pages that belong to this section (reached from its hub page): the section is marked current on them too. */
  children?: readonly string[];
}

/** Six sections: the data pages sit under Explore, and the checks and methods under How it's built. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/project", label: "The project" },
  { href: "/findings", label: "Findings" },
  { href: "/explore", label: "Explore", children: ["/ed-trends", "/access-map", "/live"] },
  { href: "/how-its-built", label: "How it's built", children: ["/data-quality", "/methodology", "/glossary", "/decisions", "/docs"] },
  { href: "/case-study", label: "Case Study" },
];

const under = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export function isCurrent(pathname: string, href: string, children: readonly string[] = []): boolean {
  return href === "/" ? pathname === "/" : under(pathname, href) || children.some((c) => under(pathname, c));
}
