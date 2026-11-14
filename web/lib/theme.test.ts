import { afterEach, describe, expect, it, vi } from "vitest";

import { applyTheme, currentTheme, NEXT_THEME, parseTheme, readTheme, THEME_INIT_SCRIPT, THEME_KEY } from "./theme";

afterEach(() => { document.documentElement.removeAttribute("data-theme"); localStorage.clear(); vi.restoreAllMocks(); });

describe("theme", () => {
  it("parses only light and dark; anything else is auto", () => {
    expect(["light", "dark", "x", null, undefined].map(parseTheme)).toEqual(["light", "dark", "auto", "auto", "auto"]);
  });
  it("cycles auto, light, dark", () => {
    expect([NEXT_THEME.auto, NEXT_THEME.light, NEXT_THEME.dark]).toEqual(["light", "dark", "auto"]);
  });
  it("applies and saves a choice, and auto clears both", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(readTheme()).toBe("dark");
    applyTheme("auto");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });
  it("still applies the choice when storage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => applyTheme("light")).not.toThrow();
    expect(currentTheme()).toBe("light");
    expect(readTheme()).toBe("auto");
  });
  it("the head script restores a saved choice before paint, and survives blocked storage", () => {
    localStorage.setItem(THEME_KEY, "dark");
    new Function(THEME_INIT_SCRIPT)();
    expect(currentTheme()).toBe("dark");
    document.documentElement.removeAttribute("data-theme");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => new Function(THEME_INIT_SCRIPT)()).not.toThrow();
    expect(currentTheme()).toBe("auto");
  });
});
