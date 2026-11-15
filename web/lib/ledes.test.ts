import { describe, expect, it } from "vitest";

import { aboveUsualLede, changesLede, checksLede, freshnessLede, levelSplitLede, takeawaysLede } from "./ledes";

const counts = (o: Partial<Record<"much_higher" | "higher" | "usual" | "lower" | "unknown", number>>) =>
  ({ much_higher: 0, higher: 0, usual: 0, lower: 0, unknown: 0, ...o });

describe("aboveUsualLede", () => {
  it("names the one hospital that was above usual", () => {
    expect(aboveUsualLede(["Singapore General Hospital"], 3)).toBe("Only Singapore General Hospital was above usual in the latest complete week.");
  });
  it("says none when none were", () => expect(aboveUsualLede([], 3)).toBe("No emergency department was above usual in the latest complete week."));
  it("counts when several were", () => expect(aboveUsualLede(["A", "B"], 5)).toBe("2 of 5 emergency departments were above usual in the latest complete week."));
  it("says every one when all were", () => {
    expect(aboveUsualLede(["A", "B"], 2)).toBe("Every emergency department with a comparison was above usual in the latest complete week.");
    expect(aboveUsualLede(["A"], 1)).toBe("A was above usual in the latest complete week.");
  });
  it("is no sentence when nothing can be compared (never a weaker one)", () => expect(aboveUsualLede([], 0)).toBeNull());
});

describe("levelSplitLede", () => {
  it("lists the levels that have hospitals, in the scale's own words", () => {
    expect(levelSplitLede(counts({ higher: 1, usual: 2, lower: 1 }))).toBe("Of 4 emergency departments with a comparison: 1 higher than usual, 2 about usual, 1 lower than usual.");
  });
  it("is singular for one", () => expect(levelSplitLede(counts({ usual: 1 }))).toBe("Of 1 emergency department with a comparison: 1 about usual."));
  it("ignores hospitals with no comparison and is null when none can be compared", () => {
    expect(levelSplitLede(counts({ unknown: 3 }))).toBeNull();
    expect(levelSplitLede(counts({ usual: 1, unknown: 2 }))).toContain("Of 1 ");
  });
});

describe("changesLede", () => {
  it("says none moved", () => expect(changesLede(0, 5)).toBe("No hospital changed its badge since the week before."));
  it("counts the ones that moved", () => expect(changesLede(2, 5)).toBe("2 of 7 hospitals changed badge since the week before."));
});

describe("takeawaysLede", () => {
  it("counts the findings", () => {
    expect(takeawaysLede(3)).toBe("3 patterns in the latest data passed a fixed statistical check.");
    expect(takeawaysLede(1)).toBe("1 pattern in the latest data passed a fixed statistical check.");
  });
  it("is no sentence for none", () => expect(takeawaysLede(0)).toBeNull());
});

describe("checksLede", () => {
  it("says nothing without checks", () => expect(checksLede(0, 0, 0)).toBeNull());
  it("states all passed", () => expect(checksLede(12, 0, 0)).toBe("All 12 checks passed."));
  it("counts warnings and says none stops publishing", () => expect(checksLede(12, 0, 2)).toBe("12 checks ran; none stops publishing and 2 raised a warning."));
  it("states blocking failures first", () => expect(checksLede(12, 1, 2)).toBe("1 of 12 checks failed and block publishing."));
});

describe("freshnessLede", () => {
  it("says nothing without a readable freshness", () => expect(freshnessLede(["unknown"])).toBeNull());
  it("states all current", () => expect(freshnessLede(["up_to_date", "up_to_date", "unknown"])).toBe("All 2 sources are up to date."));
  it("counts the late ones", () => expect(freshnessLede(["up_to_date", "due", "overdue"])).toBe("2 of 3 sources are past their publishing schedule."));
  it("handles one late source", () => expect(freshnessLede(["due"])).toBe("1 of 1 source is past its publishing schedule."));
});
