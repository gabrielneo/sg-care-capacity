/** check_id -> its section on /docs/data-quality, read from docs/data_quality.md once. */
import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { slugify } from "./coverage";
import { DOCS_DIR } from "./docs";

let cache: Map<string, string> | null = null;

export function checkHref(checkId: string): string {
  if (!cache) {
    cache = new Map();
    try {
      const source = readFileSync(path.join(DOCS_DIR, "data_quality.md"), "utf8");
      for (const m of source.matchAll(/^### (.+)$/gm)) {
        const heading = m[1]!;
        const slug = slugify(heading.replace(/`/g, ""));
        for (const id of heading.matchAll(/`([a-z_.0-9]+)`/g)) if (!cache.has(id[1]!)) cache.set(id[1]!, slug);
      }
    } catch {
      // docs/ not present at run time: link to the page instead of a section
    }
  }
  const slug = cache.get(checkId);
  return slug ? `/docs/data-quality#${slug}` : "/docs/data-quality";
}
