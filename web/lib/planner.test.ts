import { describe, expect, it } from "vitest";

import { aboveUsual, acrossHospitals, formatDelta, largestChange, longestWait, parseSort, sortHref, sortStatuses } from "./planner";
import { type HospitalStatus, levelFor } from "./status";

const mk = (code: string, pct: number | null, latest: number | null = 5, spark: (number | null)[] = []): HospitalStatus => ({
  code, level: levelFor(pct), latest, usual: pct == null ? null : 4, pct, spark });
const codes = (list: HospitalStatus[]) => list.map((s) => s.code);

describe("sortStatuses", () => {
  const list = [mk("SGH", 5, 6.2), mk("AH", null, 1.1), mk("CGH", 40, 4.0), mk("NUH", -20, null), mk("TTSH", 40, 9.5), mk("WH", null, 7.0)];

  it("against usual: the largest % above usual first, no comparison last, ties by code", () => {
    expect(codes(sortStatuses(list, "usual"))).toEqual(["CGH", "TTSH", "SGH", "NUH", "AH", "WH"]);
  });

  it("hours: the longest bed wait first, a hospital with no complete week last", () => {
    expect(codes(sortStatuses(list, "hours"))).toEqual(["TTSH", "WH", "SGH", "CGH", "AH", "NUH"]);
    // Equal hours, and two missing figures, are ties by code: never NaN.
    expect(codes(sortStatuses([mk("B", 1, 3), mk("A", 1, 3), mk("D", 1, null), mk("C", 1, null)], "hours"))).toEqual(["A", "B", "C", "D"]);
  });

  it("A–Z: by the name on the card, else by code", () => {
    const names = { SGH: "Singapore General Hospital", AH: "Alexandra Hospital", CGH: "Changi General Hospital",
      NUH: "National University Hospital", TTSH: "Tan Tock Seng Hospital", WH: "Woodlands Hospital" };
    expect(codes(sortStatuses(list, "name", names))).toEqual(["AH", "CGH", "NUH", "SGH", "TTSH", "WH"]);
    expect(codes(sortStatuses([mk("B", 1), mk("A", 1)], "name"))).toEqual(["A", "B"]);
  });

  it("returns a new list and leaves the one given alone", () => {
    const before = codes(list);
    expect(sortStatuses(list, "hours")).not.toBe(list);
    expect(codes(list)).toEqual(before);
  });
});

describe("parseSort and sortHref", () => {
  it("falls back to against usual for anything unknown", () => {
    expect(parseSort("hours")).toBe("hours");
    expect(parseSort(["name", "hours"])).toBe("name");
    for (const bad of [undefined, null, "", "HOURS", "pct"]) expect(parseSort(bad)).toBe("usual");
  });

  it("keeps the view in the link, and leaves the default order out of it", () => {
    expect(sortHref("hours", "view=planner")).toBe("/?view=planner&sort=hours");
    expect(sortHref("usual", "view=planner&sort=name")).toBe("/?view=planner");
    expect(sortHref("usual")).toBe("/");
  });
});

describe("formatDelta: the change against usual as text", () => {
  it.each([
    // Cut towards zero, never rounded up: the figure can't cross a badge threshold the hospital hasn't.
    [31, "▲ 31%", "+31%", "up"], [31.9, "▲ 31%", "+31%", "up"], [14.6, "▲ 14%", "+14%", "up"], [29.99, "▲ 29%", "+29%", "up"],
    [-18.4, "▼ 18%", "−18%", "down"], [-14.9, "▼ 14%", "−14%", "down"], [-30, "▼ 30%", "−30%", "down"],
    [1250.7, "▲ 1,250%", "+1,250%", "up"],
  ])("%s -> %s", (pct, text, spoken, direction) => {
    expect(formatDelta(pct)).toMatchObject({ text, spoken, direction });
  });

  it("under 1% either way is 0%, with no arrow and no sign", () => {
    for (const pct of [0, 0.4, 0.99, -0.4, -0.99, -0]) {
      const d = formatDelta(pct)!;
      expect(d).toEqual({ direction: "level", text: "0%", spoken: "0%", whole: 0 });
      expect(Object.is(d.whole, -0)).toBe(false);
    }
  });

  it("no usual level: nothing, never a 0%", () => {
    for (const pct of [null, undefined, NaN, Infinity]) expect(formatDelta(pct)).toBeNull();
  });
});

describe("the summary tiles", () => {
  const list = [mk("SGH", 25, 6.2), mk("AH", 45, 1.1), mk("CGH", 14.9, 4.0), mk("NUH", null, 9.9), mk("TTSH", -32, 9.5)];

  it("above usual: the hospitals with a higher or much higher badge, largest first", () => {
    expect(codes(aboveUsual(list))).toEqual(["AH", "SGH"]);
    expect(aboveUsual([mk("CGH", 14.9), mk("NUH", null)])).toEqual([]);
  });

  it("longest bed wait: raw hours, without the urgent care centre", () => {
    expect(longestWait(list)?.code).toBe("NUH");
    expect(longestWait(list, ["NUH"])?.code).toBe("TTSH");
    expect(longestWait([mk("AH", 1, 9), mk("SGH", 1, null)], ["AH"])).toBeNull();
  });

  it("largest change: furthest from its own usual, up or down; none without a usual level", () => {
    expect(largestChange(list)?.code).toBe("AH");
    expect(largestChange([mk("SGH", 25), mk("TTSH", -32)])?.code).toBe("TTSH");
    expect(largestChange([mk("B", 20), mk("A", -20)])?.code).toBe("A");
    expect(largestChange([mk("NUH", null)])).toBeNull();
  });

  it("across hospitals: the middle of each week's values, a gap under 3 hospitals", () => {
    const s = [
      mk("SGH", 1, 5, [4, 5, 6, null]), mk("CGH", 1, 5, [2, 9, null, null]), mk("TTSH", 1, 5, [3, 1, 8, 7]),
      mk("NUH", 1, 5, [9, 3, 7, 5]), mk("AH", 1, 1, [1, 1, 1, 1]),
    ];
    // Week 1: 2,3,4,9 -> 3.5. Week 2: 1,3,5,9 -> 4. Week 3: 6,7,8 -> 7. Week 4: only two hospitals.
    expect(acrossHospitals(s, ["AH"])).toEqual([3.5, 4, 7, null]);
    expect(acrossHospitals(s)).toEqual([3, 3, 6.5, 5]);          // with the fifth hospital counted
    expect(acrossHospitals([mk("SGH", 1, 5, [4]), mk("CGH", 1, 5, [5])])).toEqual([null]);
    expect(acrossHospitals([])).toEqual([]);
  });
});
