# 0002: A validation gate between the sources and the published data

**Status:** Accepted · **Date:** 2026-11-06

## Context

Every source can change without notice:
- MOH's weekly workbooks can change layout.
- A file could switch from hours to minutes.
- The CHAS clinic list contains at least one clinic placed outside Singapore (a latitude of 1.016).
- SingStat publishes two similar population files, and one of them leaves out about 20,000
  residents aged 65+.

The project's data principles (CLAUDE.md) say:
- **never fabricate, impute or interpolate values silently;**
- **failed error-level checks block publishing,** and the site keeps the last good snapshot.

## Decision

- **Checks run in two places.**
  - A **load gate** checks each file before its rows are stored. A failing row is moved to
    `quarantine_<table>` with its reason, and **never corrected**. A failing file is rejected
    whole.
  - **Dataset checks** in `sg-health validate` look across whole tables: completeness,
    freshness, reconciliation with other sources, and planning areas equal to the sum of their
    subzones.
- **Every check has a severity (ERROR or WARN) and a scope (row, file or dataset).**
  - **An ERROR at file or dataset scope blocks publishing.** The weekly job then opens a
    `data-quality` issue, and the site keeps the previous snapshot.
  - **An ERROR at row scope quarantines the row and doesn't block.** One bad clinic row doesn't
    stop the weekly publication.
  - **A WARN publishes the data with a flag.** The row's `dq_flags`, and the API's
    `meta.dq_warnings`, say so, and the site shows it next to the figure.
- **Every result is logged** in `dq_results`. Every check is documented, with its threshold and
  reasoning, in [data_quality.md](../data_quality.md).

## Alternatives considered

| Option | Why not |
|---|---|
| Fix values automatically (e.g. divide by 60 when a file looks like minutes, snap a clinic into Singapore) | That is fabrication: the published figure would no longer be what the source said |
| Block publishing on any error, including one bad row | One bad clinic row would stop the whole weekly update; the row can be left out, with a record of why, instead |
| Warnings only | Nothing would stop a layout or unit change from reaching the site |
| Check only after loading | A bad file would already be mixed into the clean tables |

## Consequences

- **What reaches the site has passed every blocking check.** In the current snapshot,
  `data-2026-11-06`, 69 checks ran: 64 passed, 3 warned, 1 was skipped, 1 row-level error
  quarantined the misplaced clinic, and 0 blocked publishing.
- **A quarantined row stays missing** until the source fixes it. The site shows that it's
  missing, never a corrected value.
- **Thresholds are judgements.** For example: a median bed wait over 24 hours is a warning, and
  over 72 hours is an error. Each one is written down with its reason, so it can be argued with.
- **Someone has to triage the `data-quality` issue** when publishing is blocked. The runbook says how.

## How it is enforced

- **Checks:** `pipeline/tests/test_validate.py` and `test_quality_*` cover each check, quarantine,
  and the publishing decision.
- **Docs:** `pipeline/tests/test_dq_docs.py` fails if any check is missing from
  `data_quality.md` or listed there with the wrong severity.
- **Publishing:** `pipeline/tests/test_publish.py` checks publishing refuses when a check blocks.
- **Weekly workflow:** `pipeline/tests/test_workflow.py` checks the workflow publishes only after
  validation succeeds, and opens an issue when it fails.
- **The site:** shows each response's `dq_warnings` under "All notes", and the Data Quality page
  lists every result.
