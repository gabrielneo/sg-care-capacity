export interface NavItem {
  href: string;
  label: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Overview" },
  { href: "/ed-trends", label: "ED Trends" },
  { href: "/access-map", label: "Access Map" },
  { href: "/data-quality", label: "Data Quality" },
  { href: "/methodology", label: "Methodology" },
  { href: "/case-study", label: "Case Study" },
];

export function isCurrent(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
