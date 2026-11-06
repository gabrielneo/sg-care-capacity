"""Data-quality layer: checks between parsing and the clean tables (see docs/data_quality.md).

    model     severities, scopes, the check registry
    gate      the load gate: generic schema checks, quarantine, findings
    rules     table-specific row and file checks, run inside the gate
    validate  dataset checks and the `sg-health validate` report
"""
