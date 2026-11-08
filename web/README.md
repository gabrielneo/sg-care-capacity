# sg-care-capacity web

The website for *Right-siting care in a super-aged Singapore*. It's built with Next.js (App
Router), TypeScript in strict mode and Tailwind.

The site reads only from the [API](../api/README.md), and only on the server. The browser never
calls the API, so the site needs no CORS settings.

## Pages

| Page | What it shows |
|---|---|
| **Overview** `/` | A scroll story driven by `/api/v1/insights`. The top finding's key number counts up, with its headline as the page title. Then the share of residents aged 65+ (`/api/v1/population`) and the top findings as steps beside a sticky chart panel; on phones each chart sits under its step. Then the case study's limits, read from `docs/case_study.md`, and links by reading time. No finding text or number is written in the site's code (`lib/story.ts`, `components/story/`) |
| **ED Trends** `/ed-trends` | Daily median wait by hospital, the day-of-week pattern, and wait against attendances (Recharts). Hospitals and dates are chosen in a plain GET form, so URLs can be shared. A **missing day is a gap in the line, never joined**, and each chart counts the gaps. Tooltips give the exact date and units. AH = urgent care centre, NUH = adults only |
| **Access Map** `/access-map` | Three views: **3D map**, the default where WebGL works; **2D map**; **Table**. In 3D (three.js via @react-three/fiber and drei, loaded only for that view):
<br>• each area's height is its residents aged 65+, and its colour its CDMP clinics per 1,000 (darker = fewer);
<br>• hover for figures, click for the side panel;
<br>• the 5 priority areas from the findings are labelled.
<br>The 2D map is shown instead without WebGL, with reduced motion or on low-memory devices. Beside the map: a quadrant chart and the shortfall bars, from the same findings. In 2D, a measure switcher and clinic points (CDMP only if wanted); darker always means worse access. The legend states the method (five groups with equal numbers of areas) |
| **Live** `/live` | The latest NUHS readings, each labelled "Estimate from NUHS public page, at {time} SGT". They come from the weekly snapshot, not a live feed |
| **Data Quality** `/data-quality` | The checks behind this snapshot, grouped by what a failure does: block publishing, quarantine rows, or warn. Failures come first; each check links to its explanation. Also a coverage grid (hospital × day, 13/26/52 weeks) with five states told apart by pattern, plus missing dates as text, and freshness for each source |
| **Methodology** `/methodology` | `docs/methodology.md` plus the data dictionary's metric definitions: sources, how data gets from download to the site, ED and access measures, the geospatial method, limitations, and what this data can't tell you |
| **Case Study** `/case-study` | `docs/case_study.md`: problem, stakeholders, personas, as-is and to-be patient flow (Mermaid), MoSCoW, success metrics, decision log, limitations. Shows a draft banner while `TODO(me)` items remain |
| **Decisions** `/decisions` | The architecture decision records in `docs/adr/` |
| **Docs** `/docs/data-dictionary`, `/docs/data-quality`, `/docs/runbook`, `/docs/insights-method` | The rest of `docs/`, rendered |

## Performance budget (Lighthouse CI)

`npm run lighthouse` (or `make lighthouse` from the repo root) runs Lighthouse three times on the
Overview, as CI does. It uses the production build and the API on its fixture snapshot, on
Lighthouse's default mobile emulation (a mid-range phone, 4× CPU slowdown, throttled 4G). The
median run must meet the budgets in `lighthouserc.json`:

| Budget | Limit | Last measured |
|---|---|---|
| Largest Contentful Paint | ≤ 2.5 s | 2.2 s (the headline; it paints as soon as the page arrives, and Lighthouse's estimate adds the scripts loading alongside it) |
| Cumulative Layout Shift | ≤ 0.01 | 0 (the count-up uses fixed-width digits; the hero is in the first HTML) |
| JavaScript transferred | ≤ 200 kB | 149 kB, almost all of it Next.js and React |

Reports are written to `web/.lighthouseci/` (git-ignored). Nothing is uploaded.
