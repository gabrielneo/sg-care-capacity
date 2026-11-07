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

/**
 * The bullet list right after the line that starts with `marker`, e.g. "**What the data can't
 * show**" in case_study.md. The Overview shows it as written there, so the text isn't duplicated.
 */
export function extractList(source: string, marker: string): string {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => l.startsWith(marker));
  if (start === -1) throw new Error(`"${marker}" not found`);
  let i = start + 1;
  while (i < lines.length && lines[i]?.trim() === "") i++;
  const out: string[] = [];
  for (; i < lines.length; i++) {
    const line = lines[i] as string;
    if (line.startsWith("- ") || (out.length > 0 && /^\s+\S/.test(line))) out.push(line);
    else break;
  }
  if (!out.length) throw new Error(`no list after "${marker}"`);
  return out.join("\n");
}

/** Render the list after `marker` in docs/<file>; `items` is its number of bullets. */
export async function renderDocList(file: string, marker: string): Promise<RenderedDoc & { items: number }> {
  const list = extractList(await readFile(path.join(DOCS_DIR, file), "utf8"), marker);
  return { ...(await renderMarkdown(list, file)), items: list.split("\n").filter((l) => l.startsWith("- ")).length };
}

/** Words in docs/<file> (or one "## " section), for a reading-time estimate. */
export async function docWords(file: string, section?: string): Promise<number> {
  const text = extractSection(await readFile(path.join(DOCS_DIR, file), "utf8"), section);
  return text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}
