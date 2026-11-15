import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/** The type and spacing scales in styles/tokens.css are the brief's (docs/design/redesign_brief.md). A change here is a design decision. */
const css = readFileSync(path.join(__dirname, "../styles/tokens.css"), "utf8");
const value = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim();
const px = (rem: string | undefined) => (rem ? Number.parseFloat(rem) * 16 : NaN);

describe("type scale", () => {
  it.each([["meta", 13, 1.4], ["small", 14, 1.5], ["body", 16, 1.65], ["h3", 18, 1.4], ["h2", 22, 1.25], ["h1", 28, 1.15], ["kpi", 28, 1]])(
    "--fs-%s is %ipx on a phone, line height %f", (name, size, line) => {
      expect(px(value(`--fs-${name}`))).toBe(size);
      expect(Number(value(`--lh-${name}`)?.split(/\s/)[0])).toBe(line);
    });

  it("grows at 640px (h2 24, h1 and KPI 36) and at 1280px (body 17)", () => {
    const wide = /@media \(min-width: 40rem\) \{\s*:root \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(wide).toContain("--fs-h2: 1.5rem");
    expect(wide).toContain("--fs-h1: 2.25rem");
    expect(wide).toContain("--fs-kpi: 2.25rem");
    expect(css).toMatch(/@media \(min-width: 80rem\) \{\s*:root \{ --fs-body: 1\.0625rem; \}/);
  });
});

describe("spacing scale", () => {
  it("is 4, 8, 12, 16, 24, 32, 48, 64, 96", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => px(value(`--space-${n}`)))).toEqual([4, 8, 12, 16, 24, 32, 48, 64, 96]);
  });

  it("sets the section gap (48, 64 on desktop), card padding and grid gap (16, 20), row gap 12, heading to lede 8, lede to content 24", () => {
    expect(value("--section-gap")).toBe("var(--space-7)");
    expect(value("--card-pad")).toBe("var(--space-4)");
    expect(value("--card-gap")).toBe("var(--space-4)");
    expect(value("--row-gap")).toBe("var(--space-3)");
    expect(value("--heading-lede")).toBe("var(--space-2)");
    expect(value("--lede-content")).toBe("var(--space-5)");
    expect(css).toMatch(/--section-gap: var\(--space-8\); --card-pad: 1\.25rem; --card-gap: 1\.25rem;/);
  });
});
