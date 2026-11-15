/**
 * Provenance is stated once per section (CLAUDE.md, data principle 4): the section's header carries the date and
 * source, and everything inside inherits it. A child shows its own tag only when it differs from the section.
 */
import type { Meta } from "./api/types";

type Provenance = Pick<Meta, "as_of" | "sources">;

/** What a section's date and sources amount to: the date and the sorted source ids. Two metas with the same key are the same provenance. */
export function provenanceKey(meta: Provenance): string {
  return `${meta.as_of}|${meta.sources.map((s) => s.id).sort().join(",")}`;
}

/** True when a child's own provenance is the section's, so the child says nothing of its own. */
export function inheritsFrom(section: Provenance, own: Provenance | null | undefined): boolean {
  return own == null || provenanceKey(section) === provenanceKey(own);
}

/** The child's own meta when it differs from the section's (the caller shows a tag for it); null when it inherits. */
export function childMeta<T extends Provenance>(section: Provenance, own: T | null | undefined): T | null {
  return own != null && !inheritsFrom(section, own) ? own : null;
}
