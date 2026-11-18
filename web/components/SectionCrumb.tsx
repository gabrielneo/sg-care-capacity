import Link from "next/link";

/**
 * "About › The project in 60 seconds": where a sub-page sits. The main nav marks the whole section (About) as current on its
 * sub-pages too (lib/nav.ts), so without this a sub-page reads as a second, differently titled copy of the section's page.
 */
export function SectionCrumb({ section, href, page }: { section: string; href: string; page: string }) {
  return (
    <nav aria-label="Breadcrumb" className="print-hide pt-2 text-small" data-testid="section-crumb">
      <ol className="flex flex-wrap items-center gap-x-2">
        <li><Link href={href} className="inline-flex min-h-11 items-center font-semibold">{section}</Link></li>
        <li aria-hidden="true" className="text-tertiary">›</li>
        <li aria-current="page" className="text-muted">{page}</li>
      </ol>
    </nav>
  );
}
