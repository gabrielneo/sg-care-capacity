# sg-care-capacity web

The website for *Right-siting care in a super-aged Singapore*. It's built with Next.js (App
Router), TypeScript in strict mode and Tailwind.

The site reads only from the [API](../api/README.md), and only on the server. The browser never
calls the API, so the site needs no CORS settings.

## Pages

| Page | What it shows |
|---|---|
| **Overview** `/` | The latest **complete** week: a plain-English summary built from the numbers by fixed rules, not an LLM (`lib/summary.ts`). Plus the attendance total against the 4-week average, the number of hospitals above their 4-week average wait (out of those that have one), and one tile per hospital. Waits are labelled "average of daily medians" |
| **ED Trends** `/ed-trends` | Daily median wait by hospital, the day-of-week pattern, and wait against attendances (Recharts). Hospitals and dates are chosen in a plain GET form, so URLs can be shared. A **missing day is a gap in the line, never joined**, and each chart counts the gaps. Tooltips give the exact date and units. AH = urgent care centre, NUH = adults only |
| **Access Map** `/access-map` | Choropleth by planning area (Leaflet) with a metric switcher. Clinic points can be limited to CDMP. Click an area, or tab to it and press Enter, to open a side panel. The legend uses **quantile** classes and states the method. A **Table** view shows the same data |
| **Live** `/live` | The latest NUHS readings, each labelled "Estimate from NUHS public page, at {time} SGT". They come from the weekly snapshot, not a live feed |
| **Data Quality** `/data-quality` | The checks behind this snapshot, grouped by what a failure does: block publishing, quarantine rows, or warn. Failures come first; each check links to its explanation. Also a coverage grid (hospital × day, 13/26/52 weeks) with five states told apart by pattern, plus missing dates as text, and freshness for each source |
| **Methodology** `/methodology` | `docs/methodology.md` plus the data dictionary's metric definitions: sources, how data gets from download to the site, ED and access measures, the geospatial method, limitations, and what this data can't tell you |
| **Case Study** `/case-study` | `docs/case_study.md`: problem, stakeholders, personas, as-is and to-be patient flow (Mermaid), MoSCoW, success metrics, decision log, limitations. Shows a draft banner while `TODO(me)` items remain |
| **Decisions** `/decisions` | The architecture decision records in `docs/adr/` |
| **Docs** `/docs/data-dictionary`, `/docs/data-quality`, `/docs/runbook` | The rest of `docs/`, rendered |
