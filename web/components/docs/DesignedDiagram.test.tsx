import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderDoc } from "@/lib/docs";

import { DESIGNED, DesignedDiagram, designedName } from "./DesignedDiagram";

describe("designedName", () => {
  it("reads a known %% designed line and ignores unknown or missing ones", () => {
    expect(designedName("%% designed: as-is-flow\nflowchart TD\n  A --> B")).toBe("as-is-flow");
    expect(designedName("%% designed: nope\nflowchart TD")).toBeNull();
    expect(designedName("flowchart TD\n  A --> B")).toBeNull();
  });
});

describe("DesignedDiagram", () => {
  it.each(Object.keys(DESIGNED))("%s has a title, a description and no raw colours", (name) => {
    render(<DesignedDiagram name={name} />);
    const svg = screen.getByRole("img");
    expect(svg.getAttribute("aria-labelledby")).toMatch(/-title .+-desc$/);
    expect(svg.querySelector("title")?.textContent).toBeTruthy();
    expect(svg.querySelector("desc")?.textContent?.length).toBeGreaterThan(80);
    expect(svg.outerHTML).not.toMatch(/#[0-9a-f]{6}\b|\bfill="(?!url)[a-z]/i);
  });

  it("keeps every step and measure of the Mermaid source", () => {
    const { container } = render(<><DesignedDiagram name="as-is-flow" /><DesignedDiagram name="to-be-flow" /></>);
    const text = container.textContent ?? "";
    for (const label of ["GP clinic", "Polyclinic", "Registration", "Seen by an ED doctor", "Yes: decision to admit", "Exits the ED",
      "Referral (to validate)", "ED visits", "NUHS: estimate", "to exit (daily median)", "Call 995", "NurseFirst helpline",
      "Healthier SG GP clinic", "Needs hospital care", "Urgent Care Centre", "cases, from Oct 2025", "Access Map",
      "ED Trends, findings", "Transitional", "awaiting long-term care"]) {
      expect(text).toContain(label);
    }
  });

  it("places each stakeholder in the quadrant the case study gives it", () => {
    render(<DesignedDiagram name="stakeholder-map" />);
    const svg = screen.getByRole("img");
    for (const q of ["MANAGE CLOSELY", "KEEP SATISFIED", "MONITOR", "KEEP INFORMED"]) expect(svg).toHaveTextContent(q);
    const source = readFileSync(path.resolve(process.cwd(), "..", "docs", "case_study.md"), "utf8");
    const points = [...source.matchAll(/^\s*(.+?): \[([\d.]+), ([\d.]+)\]$/gm)].map((m) => m[1] ?? "");
    expect(points.length).toBe(7);
    for (const p of points) expect(svg).toHaveTextContent(p);
  });
});

describe("case_study.md on the site", () => {
  it("shows the three designed diagrams, not Mermaid", async () => {
    const doc = await renderDoc("case_study.md");
    render(<>{doc.content}</>);
    expect(screen.getAllByTestId("diagram")).toHaveLength(3);
    expect(screen.queryByTestId("mermaid")).toBeNull();
  });
});
