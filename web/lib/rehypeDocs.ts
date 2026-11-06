/**
 * Two small rehype plugins for the docs:
 * - mark every paragraph, list item or table cell that contains "TODO(me)" (not code), so it
 *   renders as a visible callout, and count them;
 * - collect the h2 headings (after rehype-slug has given them ids) for a table of contents.
 */
import type { Element, Root } from "hast";
import { toString } from "hast-util-to-string";
import { SKIP, visit } from "unist-util-visit";

export interface DocStats {
  todos: number;
  headings: { id: string; text: string }[];
}

const MARKABLE = new Set(["p", "li", "td", "th"]);

export function rehypeTodo(stats: DocStats) {
  return () => (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "pre" || node.tagName === "code") return SKIP;
      if (MARKABLE.has(node.tagName) && toString(node).includes("TODO(me)")) {
        const cls = node.properties.className;
        node.properties.className = [...(Array.isArray(cls) ? cls : cls ? [String(cls)] : []), "todo-me"];
        node.properties["data-todo"] = "";
        stats.todos += 1;
        return SKIP;                                                         // a list item counts once
      }
      return undefined;
    });
  };
}

export function rehypeHeadings(stats: DocStats) {
  return () => (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "h2" && typeof node.properties.id === "string") {
        stats.headings.push({ id: node.properties.id, text: toString(node) });
      }
    });
  };
}

/**
 * Wrap glossary terms in doc text as <span data-glossary>, which the renderer turns into <Term>.
 * Never inside code; inside a link the term is text-only (no button inside a link).
 */
export function rehypeGlossary(split: (text: string) => (string | { id: string; text: string; plural: boolean })[]) {
  return () => (tree: Root) => {
    const walk = (node: Root | Element, inLink: boolean) => {
      if (node.type === "element" && (node.tagName === "code" || node.tagName === "pre")) return;
      const link = inLink || (node.type === "element" && node.tagName === "a");
      const next: Root["children"] = [];
      for (const child of node.children as Root["children"]) {
        if (child.type === "text") {
          for (const seg of split(child.value)) {
            if (typeof seg === "string") next.push({ type: "text", value: seg });
            else next.push({ type: "element", tagName: "span",
                             properties: { "data-glossary": seg.id, "data-plural": seg.plural ? "true" : undefined,
                                           "data-plain": link ? "true" : undefined },
                             children: [{ type: "text", value: seg.text }] });
          }
        } else {
          if (child.type === "element") walk(child, link);
          next.push(child);
        }
      }
      (node as Element).children = next as Element["children"];
    };
    walk(tree, false);
  };
}
