# 0009: Run the website next to the API, and keep the free API awake

**Status:** Accepted · **Date:** 2026-11-11

## Context

Measured on 2026-11-11, from Singapore:

- The API answers each call in under 10 ms, and the website renders a page in about 0.1 s. Neither
  is the bottleneck.
- Vercel ran the website's pages in Washington DC (`iad1`, its default), while the API runs in
  Singapore on Render. Every API call a page made crossed the Pacific twice (about 0.2 s). The home
  page made two or three such calls one after another (four with a search).
- Render's free plan puts the API to sleep after about 15 minutes without requests. Waking takes
  30-60 seconds, plus downloading and checking the data release (14 s measured locally). A visitor
  arriving cold, such as a reviewer opening a link, waits that long.

## Decision

- **The website's pages run in Singapore** (`web/vercel.json`: `"regions": ["sin1"]`).
- **The home page asks for everything at once.** The daily figures start from a guess at the
  weekday window that covers it while MOH is less than about four weeks behind; otherwise a second
  call fetches the exact window. The three pages of clinics are requested together.
- **A scheduled GitHub Actions job requests `/api/v1/health` every 10 minutes**
  (`keep-api-awake.yml`), so the API doesn't sleep. One always-on service fits in Render's 750 free
  instance hours a month.

## Alternatives considered

- **Render's paid Starter plan (USD 7 a month).** It never sleeps, with no scheduled job. Worth it
  if the site has regular visitors.
- **Longer caching on the website.** It already caches API answers for an hour. It doesn't help a
  first visitor, a new deploy, or a new search.

## Consequences

- GitHub can run scheduled jobs late at busy times, so an occasional cold start can still happen.
- A second free Render service would exceed the free hours. Turn the job off if one is added.

## How it is enforced

- `web/test/deploy.test.ts`: the website's region stays next to the API's (`render.yaml`).
- `web/lib/edCompare.test.ts` and `web/lib/paging.test.ts`: the early daily fetch covers the window,
  or says it doesn't; several pages can be requested at once without losing or repeating any.
- `pipeline/tests/test_workflow.py`: the job pings the uncached health endpoint every 10 minutes and
  can't write to the repository.
