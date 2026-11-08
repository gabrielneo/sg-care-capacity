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

  it.each(["Problem statement", "Stakeholder map", "Personas", "Patient flow: as-is and to-be", "Success metrics",
           "Limitations and next steps"])("%s leaves the author's judgement as TODO(me)", (heading) => {
    expect(section(caseStudy, heading)).toContain("TODO(me)");
  });

  it("names all six stakeholders", () => {
    const map = section(caseStudy, "Stakeholder map");
    for (const s of ["MOH", "Cluster operations", "ED clinicians", "GPs / Healthier SG clinics", "Seniors and caregivers", "Synapxe"]) {
      expect(map).toContain(`**${s}**`);
    }
  });

  it("has an as-is and a to-be Mermaid diagram", () => {
    expect(caseStudy.match(/```mermaid/g)).toHaveLength(2);
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
