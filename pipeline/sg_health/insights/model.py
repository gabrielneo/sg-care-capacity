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
