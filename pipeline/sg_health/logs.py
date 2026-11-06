"""Structured logging: JSON lines, plus per-source parse statistics.

Every log record is one JSON object per line. At the end of each command, every source
gets exactly one ``source_summary`` line::

    {"event": "source_summary", "source": "moh_bed_waits", "files": 2, "rows_read": 304,
     "parsed": 301, "dropped": 3, "drop_reasons": {"unparseable_value": 3}, ...}

The counts always reconcile: ``rows_read == parsed + dropped``.
"""
from __future__ import annotations

import json
import logging
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

from .config import SGT


@dataclass
class ParseStats:
    """Row accounting for one source. Parsers add to it as they go."""
    files: int = 0
    rows_read: int = 0                      # candidate rows the parser found
    parsed: int = 0                         # rows written to the warehouse
    drop_reasons: Counter = field(default_factory=Counter)
    files_skipped: Counter = field(default_factory=Counter)   # whole files not parsed, by reason
    derived: Counter = field(default_factory=Counter)         # rows written to derived tables

    @property
    def dropped(self) -> int:
        return sum(self.drop_reasons.values())

    def read(self, n: int = 1) -> None:
        self.rows_read += n

    def drop(self, reason: str, n: int = 1) -> None:
        if n:
            self.drop_reasons[reason] += n

    def as_fields(self) -> dict[str, Any]:
        return {"files": self.files, "files_skipped": dict(self.files_skipped),
                "rows_read": self.rows_read, "parsed": self.parsed, "dropped": self.dropped,
                "drop_reasons": dict(sorted(self.drop_reasons.items())),
                **({"derived": dict(self.derived)} if self.derived else {})}


def count_read(stats: Optional[ParseStats], n: int = 1) -> None:
    if stats is not None:
        stats.read(n)


def count_drop(stats: Optional[ParseStats], reason: str, n: int = 1) -> None:
    if stats is not None:
        stats.drop(reason, n)


class JsonFormatter(logging.Formatter):
    """One JSON object per line: ts (SGT), level, logger, msg, plus any structured fields.

    Structured fields are passed as ``LOG.info(msg, extra={"fields": {...}})``.
    """

    def format(self, record: logging.LogRecord) -> str:
        out: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, SGT).isoformat(timespec="seconds"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        out.update(getattr(record, "fields", None) or {})
        if record.exc_info:
            out["exc"] = self.formatException(record.exc_info)
        return json.dumps(out, default=str, ensure_ascii=False)


def configure(verbose: bool = False) -> None:
    """Send JSON lines to stderr. Safe to call more than once."""
    root = logging.getLogger()
    for h in list(root.handlers):
        if getattr(h, "_sg_health", False):
            root.removeHandler(h)
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    handler._sg_health = True   # type: ignore[attr-defined]
    root.addHandler(handler)
    root.setLevel(logging.DEBUG if verbose else logging.INFO)
