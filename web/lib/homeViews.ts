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
  { id: "planner", label: "Planner" },
  { id: "analyst", label: "Analyst" },
];

/** Anything that isn't a known view (missing, misspelt, repeated) is the public view. */
export function parseView(value: string | string[] | null | undefined): View {
  const one = Array.isArray(value) ? value[0] : value;
  return VIEWS.some((v) => v.id === one) ? (one as View) : DEFAULT_VIEW;
}

export type SectionId = "notice" | "finder" | "ednear" | "summary" | "changes" | "hospitals" | "map" | "takeaways" | "weekdays" | "methods";

/** How much a section shows: "simple" is the short form, "full" adds the detail. */
export type Density = "simple" | "full";

/**
 * A chapter is a run of sections that share one band: the page alternates "page" and "band" tones chapter by chapter,
 * so a long view reads as chapters (docs/design/redesign_brief.md). Sections with the same chapter in a row are one chapter.
 */
export type Chapter = "start" | "near" | "map" | "data" | "findings" | "pattern" | "methods";

export interface SectionSpec {
  id: SectionId;
  chapter: Chapter;
  /** The views the section appears in, each with its density. A view that isn't listed doesn't show it. */
  views: Partial<Record<View, Density>>;
}

/**
 * Every home-page section, in page order, and what each view shows (UX audit I2, G1):
 *   public:  995 notice, find care near you, the three nearest EDs, map, a short "About these numbers"
 *   planner: compact notice, KPI tiles, ED cards (the urgent care row is part of them), top three takeaways
 *   analyst: compact notice, KPI tiles, ED cards, what changed, takeaways with their evidence, weekday heatmap, how the figures are made
 */
export const SECTIONS: readonly SectionSpec[] = [
  // The 995 line and "not medical advice": on every view. Full adds where to go instead of a hospital.
  { id: "notice", chapter: "start", views: { public: "full", planner: "simple", analyst: "simple" } },
  { id: "finder", chapter: "start", views: { public: "full" } },
  // The three nearest EDs, in plain words, after a search. Public only: the full list is on Planner and Analyst.
  { id: "ednear", chapter: "near", views: { public: "full" } },
  { id: "map", chapter: "map", views: { public: "full" } },
  { id: "summary", chapter: "data", views: { planner: "full", analyst: "full" } },
  // Badge, last week's figure and the change against usual; the urgent care centre is its own full-width row in the same grid.
  { id: "hospitals", chapter: "data", views: { planner: "full", analyst: "full" } },
  // Which hospitals' badge moved since the week before, from the same weekly figures. Analyst only: Planner has the top three takeaways.
  { id: "changes", chapter: "findings", views: { analyst: "full" } },
  // Planner: the top three. Analyst: the same, with each finding's evidence level and number of data points.
  { id: "takeaways", chapter: "findings", views: { planner: "simple", analyst: "full" } },
  { id: "weekdays", chapter: "pattern", views: { analyst: "full" } },
  // Public: a short "About these numbers". Analyst: how the figures are made, with the statistics. Planner has none (it links to Analyst).
  { id: "methods", chapter: "methods", views: { public: "simple", analyst: "full" } },
];

export interface ShownSection {
  id: SectionId;
  density: Density;
  chapter: Chapter;
}

/** The sections a view shows, in page order. */
export function sectionsFor(view: View, sections: readonly SectionSpec[] = SECTIONS): ShownSection[] {
  return sections.flatMap((s) => {
    const density = s.views[view];
    return density ? [{ id: s.id, density, chapter: s.chapter }] : [];
  });
}

/** The sections of a view grouped into chapters, in page order; chapters alternate page and band tone, starting with "page". */
export function chaptersFor<T extends { chapter: Chapter }>(shown: readonly T[]): { chapter: Chapter; tone: "page" | "band"; items: T[] }[] {
  const out: { chapter: Chapter; tone: "page" | "band"; items: T[] }[] = [];
  for (const s of shown) {
    const last = out[out.length - 1];
    if (last && last.chapter === s.chapter) last.items.push(s);
    else out.push({ chapter: s.chapter, tone: out.length % 2 ? "band" : "page", items: [s] });
  }
  return out;
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

/** What each section is called in the "Jump to section" list (the strip's menu). The notice is the page's intro, so it is not a stop. */
export const SECTION_LABEL: Record<SectionId, string> = {
  notice: "Introduction",
  finder: "Find a clinic",
  ednear: "Nearest emergency departments",
  summary: "Summary",
  changes: "What changed",
  hospitals: "Hospitals",
  map: "Map",
  takeaways: "Takeaways",
  weekdays: "Weekday pattern",
  methods: "How the figures are made",
};

/** The id of the element a section sits in on the page (app/page.tsx), so a link can jump to it. */
export const sectionAnchor = (id: SectionId): string => `section-${id}`;

/** The stops in "Jump to section" for a view: its sections in page order, without the intro. */
export function jumpTargets(view: View, sections: readonly SectionSpec[] = SECTIONS): { id: SectionId; label: string; href: string }[] {
  return sectionsFor(view, sections).filter((s) => s.id !== "notice").map((s) => ({ id: s.id, label: SECTION_LABEL[s.id], href: `#${sectionAnchor(s.id)}` }));
}
