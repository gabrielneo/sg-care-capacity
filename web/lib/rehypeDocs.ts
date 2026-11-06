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
