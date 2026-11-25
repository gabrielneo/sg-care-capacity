"""rank_score and the headline findings."""
from __future__ import annotations

from datetime import date

from .. import freshness
from .detectors.common import ADULT_ONLY_CAVEAT
from .model import thresholds

URGENT_CARE = "urgent_care"


def freshness_level(source: str, as_of: date, today: date) -> str:
    """up_to_date / due / overdue, from docs/datasets.yml (the same rules as the site's badge)."""
    return freshness.level(source, as_of, today)


def rank_score(effect_norm: float, p_adjusted: float | None, completeness: float, recency: float, relevance: float = 1.0) -> float:
    confidence = 1.0 if p_adjusted is None else 1.0 - p_adjusted
    return round(max(0.0, min(1.0, effect_norm)) * confidence * completeness * recency * relevance, 6)


def relevance(type_: str, variant: str, caveats: list[str]) -> float:
    """How useful a finding is to a general reader (thresholds.yml, ranking.relevance): one hospital's weekday pattern counts for less
    than a system-wide finding, and a hospital whose figures cover adults only for less than a full one."""
    cfg = thresholds()["ranking"]["relevance"]
    w = float(cfg.get(f"{type_}_{variant.removesuffix('_tie')}", 1.0))
    return w * float(cfg["adult_only_hospital"]) if ADULT_ONLY_CAVEAT in caveats else w


def recency_weight(source: str, as_of: date, today: date) -> float:
    return float(thresholds()["ranking"]["recency"][freshness_level(source, as_of, today)])


def order(r: dict) -> tuple:
    """Highest rank_score first; ties go to the larger raw effect, then the id (deterministic)."""
    return (-r["rank_score"], -abs(r["effect_size"] or 0.0), r["insight_id"])


def headline_ranks(rows: list[dict]) -> dict[str, int]:
    """insight_id -> 1..N: the highest rank_score, at most one per detector. An urgent-care finding is
    never a headline: the headlines are the system-wide takeaways, and the UCC isn't compared with EDs (ADR 0012)."""
    n = int(thresholds()["engine"]["headline_count"])
    bar = float(thresholds()["engine"]["headline_min_score"])
    never = set(thresholds()["engine"].get("never_headline") or [])
    out: dict[str, int] = {}
    used: set[str] = set()
    for r in sorted(rows, key=order):
        if r.get("scope") == URGENT_CARE or r["type"] in used or r["type"] in never or r["rank_score"] < bar:
            continue
        used.add(r["type"])
        out[r["insight_id"]] = len(out) + 1
        if len(out) == n:
            break
    return out
