# 0005: One typed API contract, from Python models to TypeScript, checked in CI

**Status:** Accepted · **Date:** 2026-11-06

## Context

The API (Python, FastAPI) and the website (TypeScript, Next.js) are built separately. A renamed
field, an endpoint that starts returning `null`, or a new parameter can break the site silently,
and the failure would only show up in front of a user. The project also requires every figure to
carry `as_of` and its source. That rule is only as strong as the site's ability to know that
`meta` is there.

## Decision

1. **The API's Pydantic models are the contract.** Every response is `{data, meta}`, and `meta`
   always has `snapshot_id`, `as_of`, `sources`, `coverage`, `caveats` and `dq_warnings`. Errors
   use the same envelope.
2. **The schema is committed.** `python -m sg_health_api.openapi` writes `api/openapi.json`, and a
   test fails if the committed file differs from the code.
3. **TypeScript types are generated from it.** `openapi-typescript` turns `openapi.json` into
   `web/lib/api/schema.d.ts`, and CI fails if that's out of date (`npm run check:api-types`).
4. **The site's client is typed from those types.** `openapi-fetch` checks paths, query parameters
   and response shapes when the site compiles.
5. **Provenance can't be skipped.** The site's data components (`ChartCard`, `KpiTile`) require the
   generated `Meta` type, so a figure without its date and source doesn't compile.

## Alternatives considered

| Option | Why not |
|---|---|
| Hand-written TypeScript types | They drift from the API with nothing to notice |
| Runtime validation only (e.g. zod schemas in the site) | A second copy of the contract to keep in step, and mistakes surface at run time |
| GraphQL | More machinery than ten read-only endpoints need |

## Consequences

- **A breaking API change shows up in the pull request:** as a diff to `openapi.json` and
  `schema.d.ts`, and as compile errors in the site. It doesn't wait for a user to find it.
- **Changing a model takes a regeneration step** on both sides. CI says which one was forgotten.
- **TypeScript is held at 5.9**, because `openapi-typescript` supports TypeScript 5 only.

## How it is enforced

- **`api/tests/test_contract.py`:** every endpoint returns `{data, meta}` with an ISO `meta.as_of`
  and matches its declared model, and the committed `openapi.json` is up to date.
- **CI `web` job:** `npm run check:api-types` regenerates the types and fails on any difference.
- **`web/components/ChartCard.test.tsx` and `KpiTile.test.tsx`:** `@ts-expect-error` checks that
  omitting `meta` doesn't compile; they were checked to fail when `meta` is made optional.
- **`web/e2e`:** every chart card and KPI tile on every page shows a visible "Data as of" date
  and a source.
