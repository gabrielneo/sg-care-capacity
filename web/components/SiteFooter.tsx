import Link from "next/link";
import type { ReactNode } from "react";

import { DataStatus } from "@/components/DataStatus";
import { Notice995 } from "@/components/Notice995";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Glossed } from "@/components/terms/Glossed";
import { AUTHOR, AUTHOR_LINKS } from "@/lib/author";

/** A labelled group, not a heading: the page's headings are its own, and a footer must not add to its outline. */
function Column({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div role="group" aria-labelledby={id} data-testid="footer-column">
      <p id={id} className="text-small font-semibold text-ink" data-footer-title="">{title}</p>
      {children}
    </div>
  );
}

/** At most six links a column (a test counts them). */
function Links({ children }: { children: ReactNode }) {
  // Phones: the links wrap in a row (each still a 44px target) instead of one per line (review N2); one per line from 640px.
  return <ul className="mt-2 flex flex-wrap gap-x-4 sm:block sm:space-y-1">{children}</ul>;
}
const TARGET = "inline-flex min-h-11 min-w-11 items-center sm:min-h-0 sm:min-w-0";   // 44px on a phone, text-sized from 640px
const item = (href: string, label: string) => <li key={href}><Link href={href} className={TARGET}>{label}</Link></li>;

/**
 * The footer, on every page: the page's last band. Three columns: data and privacy, about this project, and help (995 and the glossary).
 * The 60-second overview, case study, GitHub and CV live here, not in the product's pages. Credits are one line.
 */
export function SiteFooter() {
  const link = (id: string) => AUTHOR_LINKS.find((l) => l.id === id);
  const external = (id: string, label: string) => {
    const l = link(id);
    return l ? (
      <li key={id}>
        <a href={l.href} target="_blank" rel="noopener noreferrer" className={TARGET}>
          {label}<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </li>
    ) : null;
  };
  return (
    <footer className="bg-band text-small text-muted" data-testid="site-footer">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-6 sm:grid-cols-3">
          <Column id="footer-data" title="Data and privacy">
            <p className="mt-2 max-w-prose">
              {/* Standalone: the footer is site chrome, so it doesn't use up the page's first use of a term. */}
              <Glossed text="Aggregate public data only (MOH, data.gov.sg, SingStat, NUHS). No personal or patient-level data." standalone />{" "}
              Page views are counted without cookies, and searches aren&apos;t recorded.
            </p>
            <Links>
              {item("/methodology", "How the figures are made")}
              {item("/data-quality", "Data quality")}
              {item("/decisions", "Decision records")}
            </Links>
            {/* Loaded in the browser (/status.json): building a page never waits on the API. */}
            <div className="mt-3"><DataStatus /></div>
          </Column>
          <Column id="footer-about" title="About this project">
            <Links>
              {item("/project", "The project in 60 seconds")}
              {item("/case-study", "Case study")}
              {external("github", "GitHub")}
              {external("cv", "CV")}
            </Links>
          </Column>
          <Column id="footer-help" title="Help">
            <Notice995 variant="footer" className="mt-2" />
            <Links>
              {item("/glossary", "Glossary")}
              {item("/styleguide", "Style guide")}
            </Links>
            <div className="mt-3"><ThemeToggle /></div>
          </Column>
        </div>
        <p className="mt-8 border-t border-line pt-4" data-testid="footer-credits">
          <span>Built by <strong className="font-semibold text-ink">{AUTHOR.name}</strong>, {AUTHOR.role}.</span>
        </p>
      </div>
    </footer>
  );
}
