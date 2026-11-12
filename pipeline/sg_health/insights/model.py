"""Types shared by the insight engine, and its configuration files."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import date
from functools import cache
from pathlib import Path
from typing import Any

import yaml

from .. import config

HERE = Path(__file__).parent
THRESHOLDS_FILE = HERE / "thresholds.yml"
TEMPLATES_FILE = HERE / "templates.yml"
ACTIONS_FILE = config.REPO_ROOT / "docs" / "insight_actions.yml"


@cache
def thresholds() -> dict[str, Any]:
    return yaml.safe_load(THRESHOLDS_FILE.read_text())


def thresholds_sha256() -> str:
    return hashlib.sha256(THRESHOLDS_FILE.read_bytes()).hexdigest()


@dataclass
class Candidate:
    """One test or measurement. It becomes an insight only if it passes its gates."""
    type: str
    entity: str
    variant: str                       # template key: worse / better / hospital / pooled / positive ...
    method: str
    n: int
    effect_size: float                 # the detector's own effect measure (tau, z, eps2, rho, ...)
    effect_norm: float                 # 0-1, for ranking
    metric_value: float | None
    unit: str
    comparison_value: float | None
    direction: str                     # better | worse | neutral
    p_value: float | None              # None for descriptive detectors (no test)
    passes_effect: bool                # the detector's own effect-size gate
    completeness: float
    as_of: date
    source: str                        # manifest source id, for recency
    values: dict[str, Any]             # template values (already formatted where needed)
    caveats: list[str]
    evidence: dict[str, str]
    action_key: str | None = None      # e.g. "worse", "negligible_or_weak"
    action_values: dict[str, Any] = field(default_factory=dict)
    chart: dict[str, Any] | None = None     # from chart(): the data the test ran on, for the site's chart
    display: dict[str, Any] = field(default_factory=dict)   # value_text, unit_text, change ("up" / "down" / None)
    period: tuple[date, date] | None = None   # first and last day of the data the finding uses (None: as_of only)
    p_adjusted: float | None = None
    reason: str = ""                   # why it was not published (filled by the engine)

    @property
    def insight_id(self) -> str:
        key = f"{self.type}|{self.entity}|{self.variant}|{self.values.get('window', '')}|{self.as_of.isoformat()}"
        return f"{self.type}-{hashlib.sha256(key.encode()).hexdigest()[:10]}"


@dataclass
class Skip:
    """A detector or entity the gates skipped, with the reason (logged to dq_results)."""
    type: str
    entity: str
    reason: str


@dataclass
class DetectorResult:
    candidates: list[Candidate] = field(default_factory=list)
    skips: list[Skip] = field(default_factory=list)
    extra: dict[str, Any] = field(default_factory=dict)    # e.g. access_gap's excluded areas


def point(key: str, label: str, value: float | None) -> dict[str, Any]:
    """One bar or line point. A missing value stays None (a gap in the chart, never 0)."""
    return {"key": key, "label": label, "value": None if value is None or value != value else round(float(value), 4)}


def chart(kind: str, y_label: str, points: list[dict[str, Any]], highlight: list[str], *,
          x_label: str | None = None, reference: tuple[float, str] | None = None,
          trend_line: tuple[float, float] | None = None) -> dict[str, Any]:
    """The chart behind an insight, built from the same values the detector tested.

    kind: "bar" or "line". highlight: the point keys the callout arrow points at (the difference the
    headline describes). reference: a horizontal line (value, label), e.g. the usual level. trend_line:
    the fitted line's value at the first and last point. The callout text comes from templates.yml.
    """
    keys = [p["key"] for p in points]
    if kind not in ("bar", "line") or len(points) < 2 or len(set(keys)) != len(keys):
        raise ValueError(f"bad chart: kind {kind!r}, {len(points)} points, keys {keys}")
    if not highlight or any(k not in keys for k in highlight):
        raise ValueError(f"chart highlight {highlight} not in its points {keys}")
    return {"kind": kind, "y_label": y_label, "x_label": x_label, "points": points, "highlight": list(highlight),
            "callout": None,
            "reference": None if reference is None else {"value": round(float(reference[0]), 4), "label": reference[1]},
            "trend_line": None if trend_line is None else {"first": round(float(trend_line[0]), 4),
                                                           "last": round(float(trend_line[1]), 4)}}
