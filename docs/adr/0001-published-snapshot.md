# 0001: Publish a verified, read-only snapshot, not a shared DuckDB file

**Status:** Accepted · **Date:** 2026-11-06

## Context

The pipeline builds `data/build/warehouse.duckdb`, its working database. Every ingest, validation
and transform run writes to it. The API and the website need data that:

- doesn't change under them halfway through a request, or halfway through a weekly rebuild;
- is exactly what passed the data-quality checks, and nothing else;
- can be traced to the code and source files that produced it;
- can be rolled back if a bad week slips through.

Early on, binary databases were committed to git. That gave no history worth having (binary
diffs), made the repository grow every week, and mixed tested code with untested data.

## Decision

- **Publishing builds a separate snapshot.** `sg-health publish` builds a fresh `analytics.duckdb`
  containing **only** the marts and the `dq_results` log, checkpointed and made read-only. It also
  writes one Parquet file per mart, the map GeoJSON, and `manifest.json`. The manifest records:
  - the snapshot id;
  - `as_of` per source;
  - row counts;
  - coverage per hospital;
  - the check summary;
  - the SHA-256 and size of every file;
  - the pipeline's git commit.
- **Publishing refuses** if any check that blocks publishing fails (see [0002](0002-validation-gate.md)).
- **Each snapshot is a GitHub Release** tagged `data-YYYY-MM-DD`. The newest 12 are kept.
  Raw downloads are kept separately, as `raw.tar.gz` on a rolling `data-latest` release.
- **The API serves exactly one snapshot**, named by `DATA_SNAPSHOT`. The default is the newest
  dated release that isn't marked pre-release. At startup the API checks every file's hash and
  every mart's row count against the manifest, then opens the database `read_only=True`.
  **If anything doesn't match, it refuses to start.**
- **No database file is ever committed to git.**

## Alternatives considered

| Option | Why not |
|---|---|
| Commit the database to git | Binary diffs; the repository grows weekly; untested data sits next to tested code |
| The API reads `warehouse.duckdb` directly | Readers would see half-built states; DuckDB allows one writer; no versioning or rollback |
| Copy the file to shared or object storage without a manifest | No proof the copy is complete, and no record of what it contains |
| A database server (e.g. Postgres) | Running cost and operations for data that changes once a week and is read-only |

## Consequences

- **Immutable and versioned.** Rolling back means pointing `DATA_SNAPSHOT` at an earlier tag.
  Withdrawing a bad snapshot means marking it pre-release, which `latest` skips. See the
  [runbook](../runbook.md).
- **Caching is simple.** A response can only change when the snapshot changes, so the ETag is the
  snapshot id.
- **The API holds no state of its own.** Any instance serving the same tag returns the same answers.
- **Limit: the manifest proves completeness, not authenticity.** It's published with the files, so
  it catches incomplete or corrupted downloads, but not a deliberately forged release. That rests on
  who can publish releases to the repository.
- **Cost:** the data refreshes weekly at most. The first download took 74 s on a home connection.
  Only 12 snapshots are kept unless one is copied elsewhere.

## How it is enforced

- **Publishing:** `pipeline/tests/test_publish.py` checks the snapshot contains only the marts and
  `dq_results`, that the file is read-only, that the manifest hashes match, and that publishing
  refuses when a check blocks it.
- **API startup:** `api/tests/test_snapshot.py` checks it refuses to start for a tampered, missing
  or miscounted file, or a tag that doesn't exist, and that it skips a pre-release under `latest`.
- **CI, `repo-guards` job:** fails if any `.duckdb`, `.parquet`, `.db`, `.sqlite` or `.xlsx` file
  is tracked in git.
- **CI, `api` job:** builds the Docker image and checks the container refuses a tampered snapshot.
