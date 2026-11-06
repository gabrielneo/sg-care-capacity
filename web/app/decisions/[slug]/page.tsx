import { readdirSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DocPage } from "@/components/docs/DocPage";
import { DOCS_DIR, renderDoc } from "@/lib/docs";

const adrs = () => readdirSync(path.join(DOCS_DIR, "adr")).filter((f) => /^\d{4}-[a-z0-9-]+\.md$/.test(f)).map((f) => f.slice(0, -3));

export const dynamicParams = false;
export const generateStaticParams = () => adrs().map((slug) => ({ slug }));

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return { title: `ADR ${(await params).slug.slice(0, 4)}` };
}

export default async function DecisionPage({ params }: { params: Params }) {
  const { slug } = await params;
  if (!adrs().includes(slug)) notFound();
  const rendered = await renderDoc(`adr/${slug}.md`);
  return (
    <DocPage toc={rendered.headings} todos={rendered.todos} aside={<Link href="/decisions">All decision records</Link>}>
      {rendered.content}
    </DocPage>
  );
}
