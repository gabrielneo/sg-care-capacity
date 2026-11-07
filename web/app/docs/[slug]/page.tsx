import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocPage } from "@/components/docs/DocPage";
import { renderDoc } from "@/lib/docs";

const DOCS: Record<string, { file: string; title: string }> = {
  "data-dictionary": { file: "data_dictionary.md", title: "Data dictionary" },
  "data-quality": { file: "data_quality.md", title: "Data quality checks" },
  runbook: { file: "runbook.md", title: "Runbook" },
  "insights-method": { file: "insights_method.md", title: "How findings are tested" },
};

export const dynamicParams = false;
export const generateStaticParams = () => Object.keys(DOCS).map((slug) => ({ slug }));

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const doc = DOCS[(await params).slug];
  return { title: doc?.title ?? "Not found" };
}

export default async function DocRoute({ params }: { params: Params }) {
  const doc = DOCS[(await params).slug];
  if (!doc) notFound();
  const rendered = await renderDoc(doc.file);
  return <DocPage toc={rendered.headings} todos={rendered.todos}>{rendered.content}</DocPage>;
}
