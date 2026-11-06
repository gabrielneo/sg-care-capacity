import { describe, expect, it, vi } from "vitest";

import { fetchAllPages } from "./paging";

describe("fetchAllPages", () => {
  it("pages until total", async () => {
    const all = Array.from({ length: 1192 }, (_, i) => i);
    const page = vi.fn(async (offset: number, limit: number) => ({ items: all.slice(offset, offset + limit), total: all.length }));
    const res = await fetchAllPages(page, 500);
    expect(res.items).toHaveLength(1192);
    expect(page.mock.calls.map((c) => c[0])).toEqual([0, 500, 1000]);
  });

  it("stops on an empty page and refuses to return a partial list", async () => {
    await expect(fetchAllPages(async () => ({ items: [], total: 3 }))).rejects.toThrow("Only 0 of 3");
  });
});
