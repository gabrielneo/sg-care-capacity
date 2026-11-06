"""Data-quality vocabulary: severities, scopes, the check registry and findings.

Every check is registered once, here, with its id, severity and scope. docs/data_quality.md
documents each id (a test enforces that), so the code and the documentation cannot drift.

Scopes
------
row      evaluated per parsed row inside the load gate. A failing ERROR row goes to
         quarantine_<table> and never into the clean table. Non-blocking: the bad row is
         already excluded, so the rest can still be published.
file     evaluated per raw file (or per sheet) inside the load gate. A failing ERROR
         quarantines every row it covers and BLOCKS publishing (e.g. a unit error).
dataset  evaluated across a whole clean table by `sg-health validate`. A failing ERROR
         BLOCKS publishing (e.g. stale data).

WARN never blocks and never quarantines: the rows are published and the finding is shown.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class Severity(str, Enum):
    ERROR = "ERROR"
    WARN = "WARN"


class Scope(str, Enum):
    ROW = "row"
    FILE = "file"
    DATASET = "dataset"


@dataclass(frozen=True)
class Check:
    check_id: str
    severity: Severity
    scope: Scope
    summary: str                      # one line; the full rationale is in docs/data_quality.md
    tables: tuple[str, ...] = ()      # tables the check applies to

    @property
    def blocks_publish(self) -> bool:
        return self.severity is Severity.ERROR and self.scope is not Scope.ROW


CHECKS: dict[str, Check] = {}


def register(check_id: str, severity: Severity, scope: Scope, summary: str,
             tables: tuple[str, ...] = ()) -> Check:
    if check_id in CHECKS:
        raise ValueError(f"duplicate check id {check_id}")
    CHECKS[check_id] = Check(check_id, severity, scope, summary, tuple(tables))
    return CHECKS[check_id]


@dataclass
class Finding:
    """One failure of one check: a row (row_key set) or a whole file/sheet (row_key None)."""
    check_id: str
    table: str
    detail: str
    row_key: Optional[dict[str, Any]] = None
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def check(self) -> Check:
        return CHECKS[self.check_id]


def key_json(key: dict[str, Any]) -> str:
    """Stable text form of a primary key, used to match findings and quarantine rows to rows."""
    return json.dumps({k: str(v) for k, v in key.items()}, sort_keys=True)
