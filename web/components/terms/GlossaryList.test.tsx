import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GLOSSARY } from "@/lib/glossary";

import { GlossaryList } from "./GlossaryList";

describe("GlossaryList", () => {
  it("lists every term, grouped by category, spelled out", () => {
    render(<GlossaryList terms={GLOSSARY} />);
    expect(screen.getByTestId("glossary-count")).toHaveTextContent(`${GLOSSARY.length} terms`);
    const abbr = screen.getByTestId("glossary-keep_abbreviation");
    expect(within(abbr).getByText("Community Health Assist Scheme (CHAS)")).toBeInTheDocument();
    expect(within(screen.getByTestId("glossary-keep_and_explain")).getByText("Median")).toBeInTheDocument();
    expect(within(screen.getByTestId("glossary-technical_only")).getByText("Public pages say: ED visits")).toBeInTheDocument();
  });

  it("searches names, abbreviations and definitions, and says how many match", () => {
    render(<GlossaryList terms={GLOSSARY} />);
    fireEvent.change(screen.getByLabelText("Search the glossary"), { target: { value: "diabetes" } });
    expect(screen.getByTestId("glossary-count")).toHaveTextContent(`1 of ${GLOSSARY.length} terms match`);
    expect(screen.getByText("Chronic Disease Management Programme (CDMP)")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search the glossary"), { target: { value: "zzz" } });
    expect(screen.getByText(/No term matches/)).toBeInTheDocument();
  });

  it("shows a pending definition as TODO(me), and links official sources", () => {
    render(<GlossaryList terms={GLOSSARY} />);
    expect(screen.getByText(/TODO\(me\): one-sentence definition/)).toHaveClass("todo-me");
    const superAged = screen.getByText("Super-aged society").closest("div")!;
    expect(within(superAged).getByRole("link", { name: "Source" })).toHaveAttribute("href", expect.stringContaining("population.gov.sg"));
  });
});
