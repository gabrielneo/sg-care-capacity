import { describe, expect, it } from "vitest";

import { cadenceSentence, nextWeeklyCheck, releaseCadence } from "./release";

const iso = (d: Date | null) => d?.toISOString().slice(0, 10);

describe("nextWeeklyCheck", () => {
  it("is the next Sunday after the release (8 Nov 2026 is a Sunday)", () => {
    expect(iso(nextWeeklyCheck("2026-11-08T17:44:14"))).toBe("2026-11-15");
  });
  it("is a week on from a Sunday release, never the same day", () => {
    expect(iso(nextWeeklyCheck("2026-11-08"))).toBe("2026-11-15");
  });
  it("counts forward from a midweek date", () => {
    expect(iso(nextWeeklyCheck("2026-11-11"))).toBe("2026-11-15");
    expect(iso(nextWeeklyCheck("2026-11-14"))).toBe("2026-11-15");
  });
  it("reads the date in Singapore time, not UTC", () => {
    // 01:00 SGT Mon 9 Nov is still Sunday in UTC; the Singapore date is the Monday.
    expect(iso(nextWeeklyCheck("2026-11-09T01:00:00"))).toBe("2026-11-15");
  });
  it("is null for a date it can't read", () => {
    expect(nextWeeklyCheck("")).toBeNull();
    expect(nextWeeklyCheck("soon")).toBeNull();
  });
});

describe("releaseCadence / cadenceSentence", () => {
  it("names the next check while it is ahead", () => {
    const now = new Date("2026-11-14T10:00:00+08:00");
    expect(releaseCadence("2026-11-08T17:44:14", now)).toEqual({ next: "Sun, 15 Nov", overdue: false });
    expect(cadenceSentence("2026-11-08T17:44:14", now)).toBe("Checked weekly on Sundays. Next check Sun, 15 Nov.");
  });
  it("is not due until 08:00 SGT on the Sunday", () => {
    expect(releaseCadence("2026-11-08", new Date("2026-11-15T07:59:00+08:00"))?.overdue).toBe(false);
    expect(releaseCadence("2026-11-08", new Date("2026-11-15T08:00:00+08:00"))?.overdue).toBe(true);
  });
  it("says so when a check has come due without a newer release", () => {
    const now = new Date("2026-11-17T09:00:00+08:00");
    expect(cadenceSentence("2026-11-08", now)).toBe("Checked weekly on Sundays. The Sun, 15 Nov check hasn't produced a newer release yet.");
  });
  it("says nothing for an unreadable date", () => {
    expect(cadenceSentence("")).toBeNull();
  });
});
