"""rank_score and the headline findings."""
from __future__ import annotations

from datetime import date

from .model import thresholds

# Freshness rules (the same as the site's badge, web/lib/freshness.ts): (green, amber) limits in days.
CADENCE_DAYS = {"weekly": (10, 21), "live": (1, 7), "annual": (457, 548), "irregular": (365, 730)}
SOURCE_CADENCE = {"moh_bed_waits": "weekly", "moh_ed_attendances": "weekly", "nuhs_live": "live",
                  "singstat_residents": "annual", "datagov_chas": "irregular"}


def freshness_level(source: str, as_of: date, today: date) -> str:
    green, amber = CADENCE_DAYS[SOURCE_CADENCE.get(source, "irregular")]
    age = (today - as_of).days
    return "green" if age <= green else "amber" if age <= amber else "red"


def rank_score(effect_norm: float, p_adjusted: float | None, completeness: float, recency: float) -> float:
    confidence = 1.0 if p_adjusted is None else 1.0 - p_adjusted
    return round(max(0.0, min(1.0, effect_norm)) * confidence * completeness * recency, 6)


def recency_weight(source: str, as_of: date, today: date) -> float:
    return float(thresholds()["ranking"]["recency"][freshness_level(source, as_of, today)])


def order(r: dict) -> tuple:
    """Highest rank_score first; ties go to the larger raw effect, then the id (deterministic)."""
    return (-r["rank_score"], -abs(r["effect_size"] or 0.0), r["insight_id"])


def headline_ranks(rows: list[dict]) -> dict[str, int]:
    """insight_id -> 1..N: the highest rank_score, at most one per detector."""
    n = int(thresholds()["engine"]["headline_count"])
    out: dict[str, int] = {}
    used: set[str] = set()
    for r in sorted(rows, key=order):
        if r["type"] in used:
            continue
        used.add(r["type"])
        out[r["insight_id"]] = len(out) + 1
        if len(out) == n:
            break
    return out
