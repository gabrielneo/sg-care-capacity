/**
 * UI metrics for the "calm & clear" redesign (docs/design/redesign_brief.md): a before/after
 * measuring stick, not a test. Run through Playwright, which starts the API on its fixture snapshot
 * and the production build:
 *
 *   npm run ui:metrics            -> ../docs/design/ui_metrics_before.json
 *   UI_METRICS_OUT=after npm run ui:metrics   -> ../docs/design/ui_metrics_after.json
 *
 * Per route and viewport (375, 768, 1280):
 * - fontSizes: distinct computed font sizes of visible elements with their own text (SVG chart text included)
 * - smallText: visible text elements under 13px
 * - textColours / backgroundColours: distinct computed colours (transparent backgrounds left out)
 * - pageHeight: document scroll height (the brief asks for it at 375; recorded at every width)
 * - dataAsOf: visible occurrences of "Data as of" or "Data to"
 * - overflow: page horizontal overflow (scrollWidth - clientWidth) and the furthest element edge past the viewport
 *
 * `collectRaw` runs inside the page, so it must stay self-contained (no imports, no outer variables).
 * Everything else is plain Node code, unit-tested in test/ui-metrics.test.ts.
 */

export interface RawPage {
  /** One entry per visible element that has its own (non-whitespace) text. */
  text: { fontSize: string; color: string }[];
  /** Computed background colour of every visible element. */
  backgrounds: string[];
  /** document.body.innerText: what a reader sees, hidden tooltips excluded. */
  innerText: string;
  scrollHeight: number;
  scrollWidth: number;
  clientWidth: number;
  /** The largest right edge of any visible, unclipped element, in CSS px from the page's left. */
  maxRight: number;
}

export interface RouteMetrics {
  fontSizes: number;
  fontSizeList: number[];
  smallText: number;
  textColours: number;
  backgroundColours: number;
  pageHeight: number;
  dataAsOf: number;
  overflow: { page: number; element: number };
}

/** The type scale's floor (--fs-meta, 13px): nothing a reader sees is smaller. */
export const SMALL_TEXT_PX = 13;
/** At most this many distinct font sizes on one route at one width (docs/design/redesign_brief.md). */
export const MAX_FONT_SIZES = 6;

/** Runs in the browser. Self-contained by design: Playwright serialises it. */
export function collectRaw(): RawPage {
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false;
    return typeof el.checkVisibility === "function" ? el.checkVisibility() : true;
  };
  const text: RawPage["text"] = [];
  const backgrounds: string[] = [];
  let maxRight = 0;
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    if (el.closest("script, style, noscript, template")) continue;
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    backgrounds.push(s.backgroundColor);
    // An element inside a scroller or a clipping box (e.g. a wide table in an overflow-x-auto
    // wrapper) can't push the page sideways, so it doesn't count towards the furthest edge.
    let clipped = false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).overflowX !== "visible") { clipped = true; break; }
    }
    const right = el.getBoundingClientRect().right + window.scrollX;
    if (!clipped && right > maxRight) maxRight = right;
    const ownText = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "");
    if (ownText) text.push({ fontSize: s.fontSize, color: s.color });
  }
  const doc = document.documentElement;
  return {
    text,
    backgrounds,
    innerText: document.body.innerText,
    scrollHeight: doc.scrollHeight,
    scrollWidth: doc.scrollWidth,
    clientWidth: doc.clientWidth,
    maxRight,
  };
}

/** A computed colour in one canonical form: "rgb(r,g,b)", "rgba(r,g,b,a)" for 0<a<1, or "transparent". */
export function normaliseColour(value: string): string {
  // Commas, spaces and the " / " alpha separator all become one comma: "rgb(1 2 3 / 50%)" = "rgb(1,2,3,50%)".
  const v = value.trim().toLowerCase().replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").replace(/[\s,/]+/g, ",");
  if (v === "" || v === "transparent") return "transparent";
  const m = /^rgba?\((\d+(?:\.\d+)?),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)(?:,([\d.]+%?))?\)$/.exec(v);
  if (!m) return v; // e.g. color(srgb ...) or oklch(...): kept as is, still distinct
  const alpha = m[4] === undefined ? 1 : m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
  if (alpha === 0) return "transparent";
  const rgb = [m[1], m[2], m[3]].map((n) => Math.round(Number(n))).join(",");
  return alpha >= 1 ? `rgb(${rgb})` : `rgba(${rgb},${Number(alpha.toFixed(3))})`;
}

/** Visible "Data as of" and "Data to" occurrences, case-insensitive: the two ways a date is stated. */
export function countDataAsOf(text: string): number {
  return (text.match(/data (?:as of|to)\b/gi) ?? []).length;
}

const px = (v: string) => Number.parseFloat(v);

export function summarise(raw: RawPage, viewportWidth: number): RouteMetrics {
  const sizes = [...new Set(raw.text.map((t) => px(t.fontSize)).filter(Number.isFinite))].sort((a, b) => a - b);
  const textColours = new Set(raw.text.map((t) => normaliseColour(t.color)));
  const bgColours = new Set(raw.backgrounds.map(normaliseColour));
  bgColours.delete("transparent");
  return {
    fontSizes: sizes.length,
    fontSizeList: sizes,
    smallText: raw.text.filter((t) => px(t.fontSize) < SMALL_TEXT_PX).length,
    textColours: textColours.size,
    backgroundColours: bgColours.size,
    pageHeight: raw.scrollHeight,
    dataAsOf: countDataAsOf(raw.innerText),
    overflow: {
      page: Math.max(0, raw.scrollWidth - raw.clientWidth),
      element: Math.max(0, Math.ceil(raw.maxRight - viewportWidth)),
    },
  };
}

/** What a route's metrics break in the type budget: more than MAX_FONT_SIZES sizes, or any text under SMALL_TEXT_PX. */
export function typeBudgetProblems(m: Pick<RouteMetrics, "fontSizes" | "fontSizeList" | "smallText">): string[] {
  const out: string[] = [];
  if (m.fontSizes > MAX_FONT_SIZES) out.push(`${m.fontSizes} font sizes (max ${MAX_FONT_SIZES}): ${m.fontSizeList.join(", ")}`);
  if (m.smallText > 0) out.push(`${m.smallText} text elements under ${SMALL_TEXT_PX}px`);
  return out;
}
