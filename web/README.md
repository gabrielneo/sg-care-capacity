# sg-care-capacity web

The website for *Right-siting care in a super-aged Singapore*. It's built with Next.js (App
Router), TypeScript in strict mode and Tailwind.

The site reads only from the [API](../api/README.md), and only on the server. The browser never
calls the API, so the site needs no CORS settings. The chart pages aren't built yet: this is the
shell, the components and the typed client.

## Run it

```bash
cd web
npm ci
cp .env.example .env.local        # API_BASE_URL=http://127.0.0.1:8000
npm run dev                       # http://localhost:3000
```

Start the API first, from the repo root:
`LOCAL_SNAPSHOT_PATH=data/build/publish uvicorn --factory sg_health_api.main:create_app`.

The component gallery is at <http://localhost:3000/dev/components>. Its first section calls the
live API, so it's also a quick check that everything is wired up.

| Variable | Where | Meaning |
|---|---|---|
| `API_BASE_URL` | server only | Base URL of the API. Without it, data components show an error state, never a figure |
| `SHOW_DEV_PAGES` | server only | `true` serves `/dev/components` in a production build. It's always on in `npm run dev`. The page is never linked from the nav and is `noindex` |

`.env.local` is git-ignored. Only `.env.example` is committed.

## Commands

| Command | What |
|---|---|
| `npm run dev` | Dev server |
| `npm run build && npm start` | Production build and server |
| `npm run lint` | ESLint (Next's core-web-vitals and TypeScript rules) |
| `npm run typecheck` | Next's route types, then `tsc --noEmit` in strict mode |
| `npm test` | Vitest and Testing Library |
| `npm run gen:api` | Regenerate `lib/api/schema.d.ts` from `../api/openapi.json` |
| `npm run check:api-types` | Regenerate, then fail if the result differs from the committed file (this runs in CI) |

## Typed API client

The types are checked at every link between the API and the site:
1. The Python models produce `api/openapi.json`. The API tests fail if it's stale.
2. `openapi.json` produces `lib/api/schema.d.ts`, via `npm run gen:api`. CI fails if that's stale.
3. `schema.d.ts` types `lib/api/client.ts`, so paths, query parameters and response bodies are
   checked when the site compiles.

```ts
import { api, settle } from "@/lib/api/client";       // server components only ("server-only")

const result = await settle(api.edDaily({ hospital: "SGH", from: "2026-10-01" }));
if (!result.ok) return <ErrorState error={result.error} />;   // ApiError: status, code, message, field
const { data, meta } = result.value;                            // typed from openapi.json
```

**Caching:** every call uses `next: { revalidate: 3600 }`, matching the API's
`Cache-Control: max-age=3600`. The data change weekly, so a new snapshot shows up on the site
within the hour.

## Every figure shows its date and source

`ChartCard` and `KpiTile` both **require** `meta` (the `meta` from the API response). This is
enforced three ways:
- **Type:** without `meta`, the code doesn't compile. There's no separate date or source prop to
  get wrong.
- **Rendering:** they always render the provenance footer:
  `Data as of {date} · Source: {publisher} · {caveat}`. The footer also shows a freshness badge,
  and the remaining caveats and data-quality warnings under "All notes".
- **Runtime:** if `meta.as_of` can't be read or there's no source, the figure is **not shown**,
  and an error state takes its place.

Tests cover all three. One test uses `@ts-expect-error` to prove that omitting `meta` doesn't
compile, and I confirmed it fails when the prop is made optional.

## Components

| Component | Use |
|---|---|
| `ChartCard` | Title, chart, and the provenance footer |
| `KpiTile` | One headline number with unit and change. Missing values show as "—" with "No data" for screen readers, never 0. Changes are neutral (no red or green), because whether a rise is good depends on the measure |
| `FreshnessBadge` | Green, amber or red based on how old `as_of` is, judged against how often its source publishes (table below). Always shows a text label alongside the colour |
| `CaveatChip` | A short caveat, or a data-quality note (`tone="warning"`) |
| `EmptyState`, `ErrorState` | Nothing to show, or something failed. `ErrorState` shows the API's error code |
| `Skeleton`, `ChartCardSkeleton` | Loading placeholders, announced once to screen readers. They only animate if the user allows motion |

**Freshness thresholds** (`lib/freshness.ts`):

| Source cadence | Green | Amber | Red |
|---|---|---|---|
| Weekly (MOH) | ≤ 10 days | ≤ 21 days | older |
| Annual (SingStat) | ≤ 15 months | ≤ 18 months | older |
| Irregular (CHAS, boundaries, polyclinics) | ≤ 12 months | ≤ 24 months | older |
| Live (NUHS readings) | ≤ 1 day | ≤ 7 days | older |

The CHAS clinic list (as of 6 Jun 2024) shows **red**, which is accurate.

**Dates:** `as_of` values from the API are Singapore time with no offset. `lib/dates.ts` reads
them as SGT, so a date-only value isn't mistaken for UTC midnight.

## Design

- **Colours:** neutral slate greys and **one accent**, deep teal `#0F766E`. Status colours only
  ever appear next to a text label. Tailwind's default palette is switched off, so only the tokens
  in `app/globals.css` exist. They mirror `lib/palette.ts`, and a test checks the two match.
- **Map:** Viridis in 5 classes, light = low and dark = high. It's colour-blind safe and readable
  in greyscale. "No data" gets its own hatched pattern (`.bg-nodata`), never the lightest class.
- **Contrast:** every text/background pair meets **WCAG AA** (4.5:1), and the focus ring meets
  3:1. A test computes the ratios.
- **Keyboard:** a visible 3 px focus ring on everything interactive, and a skip link.
  `prefers-reduced-motion` is respected.
- **Mobile first:** the layout starts at 375 px. The nav scrolls sideways on narrow screens, so
  there's no hidden menu, and its links are 44 px tap targets. Fonts are system fonts, so nothing
  is downloaded from a third party.

## Known issue

`npm audit` reports a moderate advisory in `minimatch`. It comes in through
`eslint-config-next`'s TypeScript lint tooling, which is a dev-only, lint-time dependency, and it
isn't shipped to the site. The only automatic fix downgrades the Next lint config, so it's left
until upstream updates.
