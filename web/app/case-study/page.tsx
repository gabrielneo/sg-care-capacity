import type { Metadata } from "next";
import Link from "next/link";

import { AuthorByline } from "@/components/AuthorByline";
import { DocPage } from "@/components/docs/DocPage";
import { docWords, renderDoc } from "@/lib/docs";
import { readingMinutes } from "@/lib/story";

export const metadata: Metadata = { title: "Case Study" };
export const dynamic = "force-static";

export default async function CaseStudyPage() {
  const [doc, words] = await Promise.all([renderDoc("case_study.md"), docWords("case_study.md")]);
  return (
    <DocPage toc={doc.headings} todos={doc.todos}
             aside={
               <ul className="space-y-1 border-t border-line pt-3">
                 <li><Link href="/methodology">Methodology</Link></li>
                 <li><Link href="/decisions">Decision records</Link></li>
                 <li><Link href="/data-quality">Data quality</Link></li>
               </ul>
             }>
      <aside className="mb-8 rounded-xl border border-line bg-surface p-5" aria-label="Short on time" data-testid="case-study-glance">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">Short on time?</p>
        <p className="mt-1 max-w-prose text-base text-ink">
          <Link href="/project">The project page</Link> has the three headline findings, the checks behind them and how to reach the author.
          This page is the full case study, about {readingMinutes(words)} minutes to read.
        </p>
        <AuthorByline className="mt-3 text-sm text-muted" />
      </aside>
      {doc.content}
    </DocPage>
  );
}
