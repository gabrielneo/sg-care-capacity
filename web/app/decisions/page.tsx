import type { Metadata } from "next";

import { DocPage } from "@/components/docs/DocPage";
import { renderDoc } from "@/lib/docs";

export const metadata: Metadata = { title: "Decision records" };
export const dynamic = "force-static";

export default async function DecisionsPage() {
  const rendered = await renderDoc("adr/README.md");
  return <DocPage toc={rendered.headings}>{rendered.content}</DocPage>;
}
