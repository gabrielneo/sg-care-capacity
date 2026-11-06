/** Fetch every page of a paged endpoint (the API caps a page at 500). Stops at `total`. */
export async function fetchAllPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<{ items: T[]; total: number }>,
  limit = 500,
  maxPages = 20,
): Promise<{ items: T[]; total: number }> {
  const items: T[] = [];
  let total = Infinity;
  for (let page = 0; page < maxPages && items.length < total; page++) {
    const res = await fetchPage(items.length, limit);
    total = res.total;
    items.push(...res.items);
    if (res.items.length === 0) break;
  }
  if (items.length < total) throw new Error(`Only ${items.length} of ${total} items fetched in ${maxPages} pages`);
  return { items, total };
}
