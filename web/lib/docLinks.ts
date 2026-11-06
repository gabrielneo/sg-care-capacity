/**
 * Links inside docs/ point at other Markdown files (e.g. "data_quality.md#how-it-works"). On the
 * site those become the matching pages; anything else in the repo goes to GitHub.
 */
import path from "node:path/posix";

export const REPO_BLOB = "https://github.com/gabrielneo/sg-care-capacity/blob/main/";

/** docs-relative file -> site route. ADRs are added by pattern below. */
export const DOC_ROUTES: Record<string, string> = {
  "methodology.md": "/methodology",
  "case_study.md": "/case-study",
  "data_dictionary.md": "/docs/data-dictionary",
  "data_quality.md": "/docs/data-quality",
  "runbook.md": "/docs/runbook",
  "adr/README.md": "/decisions",
};

export function routeForDoc(docPath: string): string | null {
  if (DOC_ROUTES[docPath]) return DOC_ROUTES[docPath] as string;
  const adr = docPath.match(/^adr\/(\d{4}-[a-z0-9-]+)\.md$/);
  return adr ? `/decisions/${adr[1]}` : null;
}

/** Rewrite one href found in docs/<fromFile>. */
export function siteHref(href: string, fromFile: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return href;   // external (https:, mailto:)
  if (href.startsWith("#")) return href;
  const [target = "", hash] = href.split("#");
  const resolved = path.normalize(path.join(path.dirname(fromFile), target));
  const suffix = hash ? `#${hash}` : "";
  const route = routeForDoc(resolved);
  if (route) return route + suffix;
  const repoPath = path.normalize(path.join("docs", resolved));
  return `${REPO_BLOB}${repoPath}${suffix}`;
}
