import { describe, expect, it } from "vitest";

import { formatWeek } from "./weeks";

describe("formatWeek", () => {
  it.each([
    ["2026-10-19", "2026-10-25", "19–25 Oct 2026"],
    ["2026-10-26", "2026-11-01", "26 Oct – 1 Nov 2026"],
    ["2025-12-29", "2026-01-04", "29 Dec 2025 – 4 Jan 2026"],
  ])("%s to %s is %s", (week_start, week_end, text) => expect(formatWeek({ week_start, week_end })).toBe(text));
});
