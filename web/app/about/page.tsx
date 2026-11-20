import type { Metadata } from "next";

import { Hub } from "@/components/Hub";
import { AUTHOR, AUTHOR_LINKS } from "@/lib/author";

export const metadata: Metadata = {
  title: "About",
  description: "Who built this site, the project in 60 seconds, how the figures are made, and the case study.",
};
export const dynamic = "force-static";

/**
 * About: who built it first, then the three pages that tell the project's story. Static, no data, so nothing here can be stale.
 * The "what I did" lines live on /project only (critique, 20 Nov 2026: the two pages repeated each other word for word).
 */
export default function AboutPage() {
  const link = (id: string) => AUTHOR_LINKS.find((l) => l.id === id);
  const [cv, linkedin] = [link("cv"), link("linkedin")];
  return (
    <div data-testid="about">
      <Hub title="About this project" intro="A public-data analytics project. Three pages tell its story: the short version, how it is built, and the full case study."
           items={[
             { href: "/project", title: "The project", text: "The headline findings, the checks behind them and the tools, on one page." },
             { href: "/how-its-built", title: "How it's built", text: "Where each number comes from, how it is checked, and what the data can't tell you." },
             { href: "/case-study", title: "Case study", text: "The full story: the question, the data, the decisions and what was learned." },
           ]}
           lead={
             <section aria-labelledby="author-heading" data-testid="about-author" className="mb-6 rounded-xl border border-line bg-surface card">
               <h2 id="author-heading" className="text-h3 font-semibold text-ink">Who built it</h2>
               <p className="mt-2 max-w-prose text-body text-ink">{AUTHOR.name}, {AUTHOR.role}. {AUTHOR.seeking}</p>
               <p className="mt-2 flex flex-wrap gap-x-4 text-small">
                 {cv ? <a href={cv.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 min-w-11 items-center font-semibold">Read the CV<span className="sr-only"> (opens in a new tab)</span></a> : null}
                 {linkedin ? <a href={linkedin.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 min-w-11 items-center">LinkedIn<span className="sr-only"> (opens in a new tab)</span></a> : null}
               </p>
             </section>
           } />
    </div>
  );
}
