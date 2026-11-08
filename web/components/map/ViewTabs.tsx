import Link from "next/link";

export type AccessView = "3d" | "map" | "table";

const TABS: { view: AccessView; label: string; href: string }[] = [
  { view: "3d", label: "3D map", href: "/access-map?view=3d" },
  { view: "map", label: "2D map", href: "/access-map?view=map" },
  { view: "table", label: "Table", href: "/access-map?view=table" },
];

/** The Access Map's views. Plain links, so they work without JavaScript and can be shared. */
export function ViewTabs({ active }: { active: AccessView | null }) {
  return (
    <nav aria-label="View" className="mb-4 inline-flex rounded-md border border-line bg-surface p-1" data-testid="view-tabs">
      {TABS.map((t) => (
        <Link key={t.view} href={t.href} aria-current={active === t.view ? "page" : undefined}
              className={`flex min-h-11 items-center rounded px-4 text-sm font-medium no-underline ${
                active === t.view ? "bg-accent-soft text-accent-strong" : "text-muted hover:text-ink"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
