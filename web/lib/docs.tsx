/**
 * Render docs/*.md on the site. docs/ is the single source: the same files read on GitHub and here.
 * Compiled with MDX in plain-Markdown mode (format "md"), so the files need no MDX syntax, plus
 * GitHub tables and heading anchors. Read at build time (pages using this are static).
 */
import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { evaluate } from "@mdx-js/mdx";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import * as runtime from "react/jsx-runtime";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

import { MermaidDiagram } from "@/components/docs/MermaidDiagram";
import { Term } from "@/components/terms/Term";

import { siteHref } from "./docLinks";
import { segmentText } from "./glossary";
import { type DocStats, rehypeGlossary, rehypeHeadings, rehypeTodo } from "./rehypeDocs";

export const DOCS_DIR = path.resolve(process.cwd(), "..", "docs");

export interface RenderedDoc extends DocStats {
  content: ReactNode;
}

/** The text of one "## heading" section (up to the next "## "), or the whole doc. */
export function extractSection(source: string, heading?: string): string {
  if (!heading) return source;
  const start = source.indexOf(`\n## ${heading}\n`);
  if (start === -1) throw new Error(`section "## ${heading}" not found`);
  const next = source.indexOf("\n## ", start + 4);
  return source.slice(start + 1, next === -1 ? undefined : next);
}

function components(fromFile: string) {
  return {
    a: ({ href = "", children, ...rest }: ComponentProps<"a">) => <a href={siteHref(href, fromFile)} {...rest}>{children}</a>,
    table: (props: ComponentProps<"table">) => (
      <div className="doc-table" tabIndex={0} role="region" aria-label="Table (scrolls sideways)">
        <table {...props} />
      </div>
    ),
    span: ({ children, ...rest }: ComponentProps<"span"> & Record<string, unknown>) => {
      const id = rest["data-glossary"];
      if (typeof id === "string") {
        return <Term id={id} plural={rest["data-plural"] === "true"} plain={rest["data-plain"] === "true"}>{children}</Term>;
      }
      return <span {...rest}>{children}</span>;
    },
    pre: ({ children, ...rest }: ComponentProps<"pre">) => {
      const code = children as ReactElement<{ className?: string; children?: ReactNode }> | undefined;
      if (code?.props?.className?.includes("language-mermaid")) {
        return <MermaidDiagram chart={String(code.props.children ?? "").trim()} />;
      }
      // Focusable so keyboard users can scroll a long line (WCAG 2.1.1).
      return <pre tabIndex={0} {...rest}>{children}</pre>;
    },
  };
}

export async function renderMarkdown(source: string, fromFile: string): Promise<RenderedDoc> {
  const stats: DocStats = { todos: 0, headings: [] };
  const { default: Content } = await evaluate(source, {
    ...runtime,
    format: "md",
    remarkPlugins: [remarkGfm],
    rehypePlugins: [rehypeSlug, rehypeTodo(stats), rehypeHeadings(stats), rehypeGlossary(segmentText)],
  });
  return { ...stats, content: <Content components={components(fromFile)} /> };
}

/** Render docs/<file>, optionally just one "## " section. */
export async function renderDoc(file: string, section?: string): Promise<RenderedDoc> {
  const source = await readFile(path.join(DOCS_DIR, file), "utf8");
  return renderMarkdown(extractSection(source, section), file);
}
