# Architecture decision records

Short records of the decisions that shape this project: the problem each one solves, the options
considered, and what each decision costs. A record is never edited to change its meaning. A
decision that is reversed gets a new record, and the old one is marked *Superseded*.

| # | Decision | Status | Date |
|---|---|---|---|
| [0001](0001-published-snapshot.md) | Publish a verified, read-only snapshot as a GitHub Release, not a shared DuckDB file | Accepted | 2026-11-06 |
| [0002](0002-validation-gate.md) | A validation gate: errors block publishing or quarantine rows; warnings are published and flagged | Accepted | 2026-11-06 |
| [0003](0003-svy21-for-distances-and-areas.md) | Compute every distance and area in SVY21 (EPSG:3414) | Accepted | 2026-11-06 |
| [0004](0004-choropleth-not-heatmap.md) | Show access as a choropleth with clinic points, not a heatmap | Accepted | 2026-11-06 |
| [0005](0005-typed-api-contract.md) | One typed API contract, from Python models to TypeScript, checked in CI | Accepted | 2026-11-06 |
| [0006](0006-3d-access-map.md) | A 3D access map beside the 2D map, never instead of it | Accepted | 2026-11-08 |
| [0007](0007-public-home-page.md) | A home page for the public, with the statistics one click away | Accepted | 2026-11-09 |
| [0008](0008-glossary-first-use-on-the-server.md) | Decide a glossary term's first use on the server | Accepted | 2026-11-10 |
| [0009](0009-run-pages-next-to-the-api.md) | Run the website next to the API, and keep the free API awake | Accepted | 2026-11-11 |
| [0010](0010-home-page-views.md) | One home page with three views, chosen in the URL | Accepted | 2026-11-11 |
| [0011](0011-public-view.md) | The public view leads with a triage band and a client-side clinic finder; EDs are context | Accepted | 2026-11-12 |

Each record has the same sections: **Status**, **Context**, **Decision**, **Alternatives considered**,
**Consequences**, and **How it is enforced** (the tests or checks that would fail if the decision
were quietly undone).
