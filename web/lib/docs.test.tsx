import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { extractSection, renderDoc, renderMarkdown } from "./docs";

const SAMPLE = `# Title

## First part

TODO(me): write this.

- done item
- TODO(me): an item to write

| A | B |
|---|---|
| 1 | TODO(me) |

See [the checks](data_quality.md#how-it-works).

\`\`\`mermaid
flowchart TD
  A["TODO(me) inside a diagram is not a callout"] --> B
\`\`\`

## Second part

Text.
`;

describe("renderMarkdown", () => {
  it("marks and counts TODO(me) paragraphs, items and cells, but not code", async () => {
    const doc = await renderMarkdown(SAMPLE, "case_study.md");
    expect(doc.todos).toBe(3);
    render(<>{doc.content}</>);
    const marked = document.querySelectorAll(".todo-me");
    expect([...marked].map((e) => e.tagName)).toEqual(["P", "LI", "TD"]);
  });

  it("gives h2s anchors and lists them, wraps tables, rewrites links, and shows the diagram source until drawn", async () => {
    const doc = await renderMarkdown(SAMPLE, "case_study.md");
    expect(doc.headings).toEqual([{ id: "first-part", text: "First part" }, { id: "second-part", text: "Second part" }]);
    render(<>{doc.content}</>);
    expect(screen.getByRole("heading", { level: 2, name: "First part" })).toHaveAttribute("id", "first-part");
    expect(screen.getByRole("region", { name: "Table (scrolls sideways)" })).toContainElement(screen.getByRole("table"));
    expect(screen.getByRole("link", { name: "the checks" })).toHaveAttribute("href", "/docs/data-quality#how-it-works");
    expect(screen.getByTestId("mermaid")).toHaveTextContent("flowchart TD");
  });

  it("extracts one section", () => {
    expect(extractSection(SAMPLE, "Second part")).toBe("## Second part\n\nText.\n");
    expect(() => extractSection(SAMPLE, "Nope")).toThrow('section "## Nope" not found');
  });
});

describe("the real docs render", () => {
  it.each(["methodology.md", "data_dictionary.md", "data_quality.md", "runbook.md", "case_study.md",
           "adr/0001-published-snapshot.md"])("%s", async (file) => {
    const doc = await renderDoc(file);
    expect(doc.headings.length).toBeGreaterThan(0);
  });

  it("adr/README.md (an index with no sections)", async () => {
    render(<>{(await renderDoc("adr/README.md")).content}</>);
    expect(screen.getAllByRole("link").length).toBeGreaterThanOrEqual(5);
  });

  it("the case study's TODO(me)s are counted, the methodology has none", async () => {
    expect((await renderDoc("case_study.md")).todos).toBeGreaterThan(20);
    expect((await renderDoc("methodology.md")).todos).toBe(0);
  });
});
