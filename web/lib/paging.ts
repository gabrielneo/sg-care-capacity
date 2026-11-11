/**
 * Fetch every page of a paged endpoint (the API caps a page at 500). Stops at `total`.
 *
 * `together` pages are requested at once (offsets 0, limit, 2 x limit, ...), so a list that fits in
 * them costs one round trip instead of one per page; any further pages follow one by one. Pages
 * past the end come back empty and are ignored.
 */
export async function fetchAllPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<{ items: T[]; total: number }>,
  limit = 500,
  maxPages = 20,
  together = 1,
): Promise<{ items: T[]; total: number }> {
  const first = await Promise.all(Array.from({ length: Math.min(together, maxPages) }, (_, k) => fetchPage(k * limit, limit)));
  let total = first[0]?.total ?? 0;
  const items: T[] = [];
  for (const res of first) {
    total = res.total;
    if (items.length >= total) break;
    items.push(...res.items.slice(0, total - items.length));
    if (res.items.length < limit) break;
  }
  for (let page = first.length; page < maxPages && items.length < total; page++) {
    const res = await fetchPage(items.length, limit);
    total = res.total;
    items.push(...res.items);
    if (res.items.length === 0) break;
  }
  if (items.length < total) throw new Error(`Only ${items.length} of ${total} items fetched in ${maxPages} pages`);
  return { items, total };
}
