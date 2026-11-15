import { describe, expect, it } from "vitest";

import { formatAsOf, parseAsOf, sortByDate } from "./dates";

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
    expect(formatAsOf("2026-11-11T14:00:00", { compact: true })).toBe("11 Nov 2:00 pm");
    expect(formatAsOf("2026-11-11", { compact: true })).toBe("11 Nov");
    expect(formatAsOf("2024-06-06T14:36:42")).toBe("6 Jun 2024");
    expect(formatAsOf("2026-11-06T12:01:49", { withTime: true })).toBe("6 Nov 2026, 12:01 pm SGT");
    expect(formatAsOf("2026-10-31", { withTime: true })).toBe("31 Oct 2026");
    expect(formatAsOf("nope")).toBe("unknown date");
  });
});

describe("sortByDate (audit A5)", () => {
  it("orders unsorted ISO dates by their Date values, not as text or by label", () => {
    const points = [
      { key: "2026-09-14", label: "14 Sep" }, { key: "2026-08-31", label: "31 Aug" }, { key: "2026-09-07", label: "7 Sep" },
      { key: "2026-08-24", label: "24 Aug" }, { key: "2026-10-19", label: "19 Oct" }, { key: "2026-10-05", label: "5 Oct" },
    ];
    // Sorting the labels as text would give 14 Sep, 19 Oct, 24 Aug, 31 Aug, 5 Oct, 7 Sep.
    expect(sortByDate(points, (p) => p.key).map((p) => p.label)).toEqual(["24 Aug", "31 Aug", "7 Sep", "14 Sep", "5 Oct", "19 Oct"]);
  });

  it("compares times too, and keeps equal dates in the order given", () => {
    const xs = ["2026-11-06T12:01:49", "2026-11-06", "2026-11-05T23:59:00", "2026-11-06"];
    expect(sortByDate(xs.map((k, i) => ({ k, i })), (x) => x.k).map((x) => x.i)).toEqual([2, 1, 3, 0]);
  });

  it("leaves a category axis (weekdays, groups) in its own order", () => {
    const days = ["mon", "tue", "wed"].map((key) => ({ key }));
    expect(sortByDate(days, (d) => d.key)).toEqual(days);
    expect(sortByDate([], (d: { key: string }) => d.key)).toEqual([]);
  });
});
