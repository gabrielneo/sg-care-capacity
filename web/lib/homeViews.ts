/**
 * The clinic finder's address and its sections' anchors. Until 18 Nov 2026 this file defined three views of one page
 * (Public, Planner, Analyst; docs/adr/0010-home-page-views.md). Only the public finder remains: the weekly figures the other
 * two showed are on ED Trends, the findings and the one-page summary.
 */

/** Where the clinic finder lives. "/" is the landing page (app/page.tsx). */
export const FIND_PATH = "/find";

/** The finder's sections, in page order. */
export type SectionId = "notice" | "finder" | "ednear" | "map" | "methods";

/** The id of the element a section sits in on the page, so a link can jump to it. */
export const sectionAnchor = (id: SectionId): string => `section-${id}`;
