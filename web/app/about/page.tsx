import type { Metadata } from "next";
import Link from "next/link";

import { Hub } from "@/components/Hub";
import { Glossed } from "@/components/terms/Glossed";
import { AUTHOR, AUTHOR_LINKS, WHAT_I_DID } from "@/lib/author";

export const metadata: Metadata = {
  title: "About",
  description: "Who built this site, the project in 60 seconds, how the figures are made, and the case study.",
};
export const dynamic = "force-static";

/** About: the 60-second overview first, then the three pages that tell the project's story. Static, no data, so nothing here can be stale. */
export default function AboutPage() {
  const link = (id: string) => AUTHOR_LINKS.find((l) => l.id === id);
  const [cv, linkedin] = [link("cv"), link("linkedin")];
  return (
    <div data-testid="about">
      <Hub title="About this project" intro={`A public-data analytics project by ${AUTHOR.name}, ${AUTHOR.role}. ${AUTHOR.seeking}`}
           items={[
             { href: "/project", title: "The project", text: "The headline findings, the checks behind them and the tools, on one page." },
             { href: "/how-its-built", title: "How it's built", text: "Where each number comes from, how it is checked, and what the data can't tell you." },
             { href: "/case-study", title: "Case study", text: "The full story: the question, the data, the decisions and what was learned." },
           ]}
           lead={
             <section aria-labelledby="sixty-heading" data-testid="sixty-seconds" className="mb-6 rounded-xl border border-line bg-surface card">
               <h2 id="sixty-heading" className="text-h3 font-semibold text-ink">The project in 60 seconds</h2>
               <ul className="mt-3 max-w-prose list-disc space-y-1 pl-6 text-body text-ink">
                 {WHAT_I_DID.map((line) => <li key={line}><Glossed text={line} /></li>)}
               </ul>
               <p className="mt-2 flex flex-wrap gap-x-4 text-small">
                 <Link href="/project" className="inline-flex min-h-11 min-w-11 items-center font-semibold">Open the project page</Link>
                 {cv ? <a href={cv.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 min-w-11 items-center">Read the CV<span className="sr-only"> (opens in a new tab)</span></a> : null}
                 {linkedin ? <a href={linkedin.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 min-w-11 items-center">LinkedIn<span className="sr-only"> (opens in a new tab)</span></a> : null}
               </p>
             </section>
           } />
    </div>
  );
}
