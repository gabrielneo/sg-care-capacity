import type { Metadata } from "next";
import Link from "next/link";

import { DocPage } from "@/components/docs/DocPage";
import { renderDoc } from "@/lib/docs";

export const metadata: Metadata = { title: "Case Study" };
export const dynamic = "force-static";

export default async function CaseStudyPage() {
  const doc = await renderDoc("case_study.md");
  return (
    <DocPage toc={doc.headings} todos={doc.todos}
             aside={
               <ul className="space-y-1 border-t border-line pt-3">
                 <li><Link href="/methodology">Methodology</Link></li>
                 <li><Link href="/decisions">Decision records</Link></li>
                 <li><Link href="/data-quality">Data quality</Link></li>
               </ul>
             }>
      {doc.content}
    </DocPage>
  );
}
