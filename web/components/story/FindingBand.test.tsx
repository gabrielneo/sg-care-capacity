import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { insightMeta, storySample } from "@/lib/samples";

import { EvidenceChip } from "./EvidenceChip";
import { FindingBand } from "./FindingBand";

const anomaly = storySample[1]!;

describe("EvidenceChip", () => {
  it.each([["observed", "Observed"], ["tested", "Tested"], ["robust", "Tested, robust"], ["association-only", "Association only"]] as const)(
    "%s: a symbol, a word and the full sentence, never colour alone", (level, word) => {
      render(<EvidenceChip level={level} />);
      const chip = screen.getByTestId("evidence-chip");
      expect(chip).toHaveTextContent(word);
      expect(chip.querySelector("[aria-hidden=true]")).not.toBeNull();
      expect(chip).toHaveAttribute("data-level", level);
      expect(chip.className).not.toMatch(/status-/);          // evidence is not status
    });
});

describe("FindingBand", () => {
  const band = (tone: "page" | "band" = "band") =>
    render(<FindingBand insight={anomaly} index={1} total={3} meta={{ ...insightMeta, as_of: anomaly.as_of }} tone={tone} />);

  it("has the number and headline, one chart, the evidence line, one method line and a quiet caveat", () => {
    band();
    expect(screen.getByText("Finding 2 of 3")).toBeInTheDocument();
    expect(screen.getByTestId("step-headline")).toBeInTheDocument();
    expect(screen.getAllByTestId("chart-frame")).toHaveLength(1);
    expect(screen.getByTestId("step-evidence")).toHaveTextContent(/n = /);
    expect(screen.getByTestId("finding-method")).toHaveTextContent(`Method: ${anomaly.method}`);
    const caveat = screen.getByTestId("finding-caveat");
    expect(caveat.tagName).toBe("ASIDE");
    expect(caveat).toHaveClass("bg-sunken");
    expect(caveat).not.toHaveAttribute("role", "alert");
  });

  it("puts every caveat after the first, and the window, in a closed drawer", () => {
    band();
    const drawer = screen.getByTestId("finding-more");
    expect(drawer.tagName).toBe("DETAILS");
    expect(drawer).not.toHaveAttribute("open");
    expect(drawer).toHaveTextContent("More about these figures");
    expect(screen.getByTestId("finding-window-range")).toHaveTextContent(/^Uses data /);
  });

  it("takes its band or page tone from the caller", () => {
    band("page");
    expect(screen.getByTestId("section")).toHaveAttribute("data-tone", "page");
  });
});
