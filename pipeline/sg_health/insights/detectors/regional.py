"""How do regions compare? Off until the planning area -> cluster mapping is approved (docs/insights_method.md)."""
from __future__ import annotations

from typing import Any

from ..model import DetectorResult, Skip


def detect(cfg: dict[str, Any]) -> DetectorResult:
    out = DetectorResult()
    if not cfg.get("enabled"):
        out.skips.append(Skip("regional", "all", "the planning area to cluster mapping has not been approved yet"))
    return out
