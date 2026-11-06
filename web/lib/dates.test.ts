import { describe, expect, it } from "vitest";

import { formatAsOf, parseAsOf } from "./dates";

describe("as_of dates are Singapore time", () => {
  it("reads a date-only value as midnight SGT, not UTC", () => {
    expect(parseAsOf("2026-10-31")?.toISOString()).toBe("2026-10-30T16:00:00.000Z");
  });
  it("reads a naive timestamp as SGT, whatever the server's time zone", () => {
    expect(parseAsOf("2026-11-06T12:01:49")?.toISOString()).toBe("2026-11-06T04:01:49.000Z");
  });
  it("returns null for anything unparseable", () => {
    for (const v of ["", "yesterday", "2026-13-45", null, undefined]) expect(parseAsOf(v)).toBeNull();
  });
  it("formats for display", () => {
    expect(formatAsOf("2026-10-31")).toBe("31 Oct 2026");
    expect(formatAsOf("2024-06-06T14:36:42")).toBe("6 Jun 2024");
    expect(formatAsOf("2026-11-06T12:01:49", { withTime: true })).toBe("6 Nov 2026, 12:01 pm SGT");
    expect(formatAsOf("2026-10-31", { withTime: true })).toBe("31 Oct 2026");
    expect(formatAsOf("nope")).toBe("unknown date");
  });
});
