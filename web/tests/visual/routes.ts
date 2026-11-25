/**
 * The routes the "calm & clear" redesign is measured on (docs/design/redesign_brief.md). The visual
 * baseline and the UI metrics both read this list, so before and after cover the same pages.
 * Per-hospital ED Trends pages are added at run time from the API's own hospital list, never hard-coded.
 */
export interface VisualRoute {
  /** File-name stem for screenshots and the key in ui_metrics_*.json. */
  name: string;
  path: string;
}

export const ROUTES: readonly VisualRoute[] = [
  { name: "home", path: "/" },
  { name: "home-public", path: "/find" },
  { name: "project", path: "/project" },
  { name: "findings", path: "/findings" },
  { name: "explore", path: "/explore" },
  { name: "ed-trends", path: "/ed-trends" },
  { name: "access-map", path: "/access-map" },
  { name: "live", path: "/live" },
  { name: "data-quality", path: "/data-quality" },
  { name: "methodology", path: "/methodology" },
  { name: "glossary", path: "/glossary" },
  { name: "case-study", path: "/case-study" },
  { name: "docs-insights-method", path: "/docs/insights-method" },
];

/** One ED Trends page per hospital: there is no per-hospital route, so the page's own filter is used. */
export const hospitalRoute = (code: string): VisualRoute => ({
  name: `ed-trends-hospital-${code.toLowerCase()}`,
  path: `/ed-trends?hospital=${encodeURIComponent(code)}`,
});

export const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "768", width: 768, height: 1024 },
  { name: "1280", width: 1280, height: 800 },
] as const;

/** The API the visual config starts (same port as the e2e suite). */
export const API_ORIGIN = "http://127.0.0.1:8791";
