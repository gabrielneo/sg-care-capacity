import type { Metadata } from "next";
import Link from "next/link";

import { DocPage } from "@/components/docs/DocPage";
import { renderDoc } from "@/lib/docs";

export const metadata: Metadata = { title: "Methodology" };
export const dynamic = "force-static";

const DICTIONARY_SECTION = "Marts (what the API and site read)";

export default async function MethodologyPage() {
  const [methodology, dictionary] = await Promise.all([renderDoc("methodology.md"), renderDoc("data_dictionary.md", DICTIONARY_SECTION)]);
  const toc = [...methodology.headings, { id: "metric-definitions", text: "Metric definitions" }];
  return (
    <DocPage toc={toc} todos={methodology.todos + dictionary.todos}
             aside={
               <ul className="space-y-1 border-t border-line pt-3">
                 <li><Link href="/docs/data-dictionary">Full data dictionary</Link></li>
                 <li><Link href="/docs/data-quality">Every data-quality check</Link></li>
                 <li><Link href="/decisions">Decision records</Link></li>
               </ul>
             }>
      {methodology.content}
      <h2 id="metric-definitions">Metric definitions</h2>
      <p>
        From the <Link href="/docs/data-dictionary">data dictionary</Link>: every column the site shows, with its definition, unit,
        source and caveats.
      </p>
      <div className="doc-embedded">{dictionary.content}</div>
    </DocPage>
  );
}
