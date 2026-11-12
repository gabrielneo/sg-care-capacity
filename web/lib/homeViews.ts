/**
 * The home page's views: one page, three readers (docs/adr/0010-home-page-views.md; the public view: 0011).
 *
 * The view is in the URL (?view=planner), so it can be shared and works with back and forward.
 * Each section says which views it appears in and how much it shows there; the page renders
 * whatever this list gives it, in this order. Adding a view or moving a section is a change here,
 * never a second copy of the page. A view changes what is shown, not how any figure is computed.
 */
export type View = "public" | "planner" | "analyst";

export const DEFAULT_VIEW: View = "public";

export const VIEWS: readonly { id: View; label: string }[] = [
  { id: "public", label: "Public" },
  { id: "planner", label: "Planner summary" },
  { id: "analyst", label: "Analyst detail" },
];

/** Anything that isn't a known view (missing, misspelt, repeated) is the public view. */
export function parseView(value: string | string[] | null | undefined): View {
  const one = Array.isArray(value) ? value[0] : value;
  return VIEWS.some((v) => v.id === one) ? (one as View) : DEFAULT_VIEW;
}

export type SectionId = "notice" | "finder" | "ednear" | "summary" | "hospitals" | "map" | "takeaways" | "weekdays" | "links" | "methods";

/** How much a section shows: "simple" is the short form, "full" adds the detail. */
export type Density = "simple" | "full";

export interface SectionSpec {
  id: SectionId;
  /** The views the section appears in, each with its density. A view that isn't listed doesn't show it. */
  views: Partial<Record<View, Density>>;
}

/** Every home-page section, in page order. */
export const SECTIONS: readonly SectionSpec[] = [
  // The 995 line and "not medical advice": on every view. Full adds where to go instead of a hospital.
  { id: "notice", views: { public: "full", planner: "simple", analyst: "simple" } },
  { id: "finder", views: { public: "full" } },
  // The three nearest EDs, in plain words, after a search. Public only: the full list is on Planner and Analyst.
  { id: "ednear", views: { public: "full" } },
  { id: "summary", views: { planner: "full", analyst: "full" } },
  // Simple: badge, last week's figure and one sentence. Full adds the 12-week line and the change against usual.
  { id: "hospitals", views: { planner: "full", analyst: "full" } },
  { id: "map", views: { public: "full" } },
  { id: "takeaways", views: { planner: "full", analyst: "full" } },
  { id: "weekdays", views: { analyst: "full" } },
  { id: "links", views: { analyst: "full" } },
  // Definitions and limits: on every view. Full opens it and adds the statistics behind each takeaway.
  { id: "methods", views: { public: "simple", planner: "simple", analyst: "full" } },
];

export interface ShownSection {
  id: SectionId;
  density: Density;
}

/** The sections a view shows, in page order. */
export function sectionsFor(view: View, sections: readonly SectionSpec[] = SECTIONS): ShownSection[] {
  return sections.flatMap((s) => {
    const density = s.views[view];
    return density ? [{ id: s.id, density }] : [];
  });
}

/** A section's density in a view, or null if the view doesn't show it. */
export function densityOf(view: View, id: SectionId, sections: readonly SectionSpec[] = SECTIONS): Density | null {
  return sections.find((s) => s.id === id)?.views[view] ?? null;
}

/**
 * The home page's address for a view, keeping everything else in the query string. The public view
 * is the plain address: no ?view= at all. The clinic search isn't in the query string: it is in the
 * fragment, which the browser keeps to itself, so changing view starts without it.
 */
export function viewHref(view: View, current: string | URLSearchParams = ""): string {
  const q = new URLSearchParams(current);
  q.delete("view");
  if (view !== DEFAULT_VIEW) q.set("view", view);
  const s = q.toString();
  return s ? `/?${s}` : "/";
}
