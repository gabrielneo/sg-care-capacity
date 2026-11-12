import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ensurePlaces, hashFor, parseHash, resetFinder, search, setType } from "./finderStore";

describe("the search in the fragment", () => {
  it("reads and writes #near=...&type=...", () => {
    expect(parseHash("#near=460123&type=gp")).toEqual({ query: "460123", type: "gp" });
    expect(parseHash("#near=Jurong%20West")).toEqual({ query: "Jurong West", type: "all" });
    expect(parseHash("")).toEqual({ query: "", type: "all" });
    expect(parseHash("#type=nonsense&near=x")).toEqual({ query: "x", type: "all" });
    expect(hashFor("460123", "all")).toBe("#near=460123");
    expect(hashFor(" Jurong West ", "polyclinic")).toBe("#near=Jurong+West&type=polyclinic");
    expect(hashFor("", "all")).toBe("");
  });

  it("keeps at most 60 characters", () => {
    expect(parseHash(`#near=${"a".repeat(100)}`).query).toHaveLength(60);
    expect(parseHash(hashFor("b".repeat(100), "all")).query).toHaveLength(60);
  });
});

describe("the place lists", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    resetFinder();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", "/");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("are fetched once, and the request has no search text in it", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ gps: [], polyclinics: [], hospitals: [] }) });
    ensurePlaces();
    ensurePlaces();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/places.json");
    search("460123");
    await Promise.resolve();
    for (const call of fetchMock.mock.calls) expect(JSON.stringify(call)).not.toContain("460123");
  });

  it("searching puts the search in the fragment only, never in the path or query", () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ gps: [], polyclinics: [], hospitals: [] }) });
    search("460123");
    expect(window.location.hash).toBe("#near=460123");
    expect(window.location.search).toBe("");
    setType("gp");
    expect(window.location.hash).toBe("#near=460123&type=gp");   // the filter joins the search
    expect(window.location.pathname).toBe("/");
  });

  it("setType keeps the search and replaces the history entry", () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ gps: [], polyclinics: [], hospitals: [] }) });
    search("Bedok");
    const before = window.history.length;
    setType("polyclinic");
    expect(window.location.hash).toBe("#near=Bedok&type=polyclinic");
    expect(window.history.length).toBe(before);
  });
});
