import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const DOCS = path.resolve(__dirname, "../../../docs");
const caseStudy = readFileSync(path.join(DOCS, "case_study.md"), "utf8");
const methodology = readFileSync(path.join(DOCS, "methodology.md"), "utf8");

const section = (doc: string, heading: string) => {
  const start = doc.indexOf(`\n## ${heading}\n`);
  if (start === -1) return "";
  const next = doc.indexOf("\n## ", start + 4);
  return doc.slice(start, next === -1 ? undefined : next);
};

describe("case study", () => {
  const SECTIONS = ["Problem statement", "Stakeholder map", "Personas", "Patient flow: as-is and to-be",
    "Prioritised requirements (MoSCoW)", "Success metrics", "Decision log", "Limitations and next steps"];

  it("has the eight sections, in order", () => {
    const found = [...caseStudy.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(found).toEqual(SECTIONS);
  });

  it("contains no blockquotes, so no quote can be passed off as a stakeholder's words", () => {
    expect(caseStudy.split("\n").filter((l) => l.startsWith(">"))).toEqual([]);
  });

  it("is complete: no TODO(me) left, and it says its assumptions are labelled", () => {
    expect(caseStudy).not.toContain("TODO(me)");
    expect(caseStudy).toContain("Assumptions are labelled as such");
    const last = section(caseStudy, "Limitations and next steps");
    for (const part of ["### What surprised, what was hard, what would change", "### Lessons for business analysis"]) {
      expect(last).toContain(part);
    }
  });

  it("the problem statement cites its policy context and labels its assumption", () => {
    const problem = section(caseStudy, "Problem statement");
    expect(problem).not.toContain("TODO(me)");
    expect(problem).toContain("*Assumption, to validate:*");
    for (const source of ["population.gov.sg", "ntu.edu.sg", "moh.gov.sg"]) expect(problem).toContain(source);
  });

  it("the stakeholder map says what its placements rest on, and cites official sources", () => {
    const map = section(caseStudy, "Stakeholder map");
    expect(map).not.toContain("TODO(me)");
    expect(map).toContain("not validated with the");
    for (const source of ["moh.gov.sg", "aic.sg", "healthinfo.gov.sg"]) expect(map).toContain(source);
  });

  it("the personas are labelled hypotheses from published role descriptions, with no invented names", () => {
    const personas = section(caseStudy, "Personas");
    expect(personas).not.toContain("TODO(me)");
    expect(personas).toContain("proto-personas");
    expect(personas.match(/Not interviewed\./g)).toHaveLength(2);
    expect(personas).toMatch(/### Persona 1: MOH healthcare services planner/);
    expect(personas).toMatch(/### Persona 2: AIC community care planner/);
  });

  it("the to-be flow is MOH's intended flow, sourced, with what the site can and can't see", () => {
    const flow = section(caseStudy, "Patient flow: as-is and to-be");
    expect(flow).not.toContain("TODO(me)");
    expect(flow).toContain("not a redesign by the author");
    expect(flow).toContain("**Can't see:**");
    expect(flow).toContain("Still not validated");
    for (const source of ["moh.gov.sg/seeking-healthcare", "1777", "nuhs.edu.sg"]) expect(flow).toContain(source);
  });

  it("every requirement has a priority, and none is left as TODO(me)", () => {
    const moscow = section(caseStudy, "Prioritised requirements (MoSCoW)");
    expect(moscow).not.toContain("TODO(me)");
    const rows = [...moscow.matchAll(/^\| ([MSCW]\d) \| [^|]+ \| (Must|Should|Could|Won't) \|/gm)];
    expect(rows.map((r) => r[1])).toEqual(["M1", "M2", "M3", "M4", "M5", "M6", "M7", "S1", "S2", "S3", "S4", "C1", "C2", "W1", "W2", "W3"]);
    for (const [, id, priority] of rows) expect(priority?.[0]).toBe(id?.[0] === "C" ? "C" : id?.[0] === "W" ? "W" : id?.[0]);
  });

  it("built requirements name the tests that cover them", () => {
    const moscow = section(caseStudy, "Prioritised requirements (MoSCoW)");
    const s3 = moscow.split("\n").find((l) => l.startsWith("| S3 |"))!;
    expect(s3).toMatch(/\| Built: .*csv\.test\.ts.*exports\.spec\.ts/);
    const s4 = moscow.split("\n").find((l) => l.startsWith("| S4 |"))!;
    expect(s4).toMatch(/\| Built: `\/summary`.*summary\.test\.ts.*summary\.spec\.ts/);
  });

  it("success metrics have targets, say whether each is met, and claim no outcome", () => {
    const metrics = section(caseStudy, "Success metrics");
    expect(metrics).not.toContain("TODO(me)");
    expect(metrics).toContain("No outcomes have been measured, and none are claimed.");
    expect(metrics).toContain("not user research");
    expect(metrics.match(/\| (?:Met(?: \(| \|)|\*\*Not met\*\*)/g)).toHaveLength(4);     // one verdict per metric
  });

  it("names all six stakeholders", () => {
    const map = section(caseStudy, "Stakeholder map");
    for (const s of ["MOH", "Cluster operations", "ED clinicians", "GPs / Healthier SG clinics", "Seniors and caregivers", "Synapxe"]) {
      expect(map).toContain(`**${s}**`);
    }
  });

  it("has a stakeholder grid and the as-is and to-be Mermaid diagrams", () => {
    expect(caseStudy.match(/```mermaid/g)).toHaveLength(3);
    expect(section(caseStudy, "Stakeholder map")).toContain("quadrantChart");
  });

  it("links every ADR in its decision log", () => {
    const log = section(caseStudy, "Decision log");
    for (const n of ["0001", "0002", "0003", "0004", "0005", "0006"]) expect(log).toMatch(new RegExp(`\\(adr/${n}-[a-z0-9-]+\\.md\\)`));
  });
});

describe("methodology", () => {
  it.each(["Sources", "From download to published figure", "Emergency department measures", "Clinic access: what is measured",
           "Why SVY21 (EPSG:3414)", "Limitations", "What this data can't tell you"])("covers %s", (heading) => {
    expect(methodology).toContain(`\n## ${heading}\n`);
  });
});
