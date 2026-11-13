"""rank_score and the headline findings."""
from __future__ import annotations

from datetime import date

from .. import freshness
from .model import thresholds

URGENT_CARE = "urgent_care"


def freshness_level(source: str, as_of: date, today: date) -> str:
    """up_to_date / due / overdue, from docs/datasets.yml (the same rules as the site's badge)."""
    return freshness.level(source, as_of, today)


def rank_score(effect_norm: float, p_adjusted: float | None, completeness: float, recency: float) -> float:
    confidence = 1.0 if p_adjusted is None else 1.0 - p_adjusted
    return round(max(0.0, min(1.0, effect_norm)) * confidence * completeness * recency, 6)


def recency_weight(source: str, as_of: date, today: date) -> float:
    return float(thresholds()["ranking"]["recency"][freshness_level(source, as_of, today)])


def order(r: dict) -> tuple:
    """Highest rank_score first; ties go to the larger raw effect, then the id (deterministic)."""
    return (-r["rank_score"], -abs(r["effect_size"] or 0.0), r["insight_id"])


def headline_ranks(rows: list[dict]) -> dict[str, int]:
    """insight_id -> 1..N: the highest rank_score, at most one per detector. An urgent-care finding is
    never a headline: the headlines are the system-wide takeaways, and the UCC isn't compared with EDs (ADR 0012)."""
    n = int(thresholds()["engine"]["headline_count"])
    out: dict[str, int] = {}
    used: set[str] = set()
    for r in sorted(rows, key=order):
        if r.get("scope") == URGENT_CARE or r["type"] in used:
            continue
        used.add(r["type"])
        out[r["insight_id"]] = len(out) + 1
        if len(out) == n:
            break
    return out
