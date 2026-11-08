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

Each record has the same sections: **Status**, **Context**, **Decision**, **Alternatives considered**,
**Consequences**, and **How it is enforced** (the tests or checks that would fail if the decision
were quietly undone).
