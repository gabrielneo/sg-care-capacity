"""The insight engine: runs after transform and before the snapshot is built.

1. Load the marts and the latest validation run.
2. Gates: skip a detector whose input tables have a check that blocks publishing; detectors skip
   hospitals and areas below the completeness threshold. Every skip is logged to dq_results.
3. Run the detectors. Each returns candidates (tests or measurements).
4. Benjamini-Hochberg across every p-value in the run.
5. Publish a candidate only if it passes its own effect-size gate and, where it has a p-value,
   p_adjusted < alpha. Missing evidence means no sentence.
6. Wording from templates.yml (checked), actions from docs/insight_actions.yml (reviewed only).
7. rank_score; the top findings, at most one per detector, become the headline findings.
8. Write marts.fct_insight; return everything insights.json needs.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any

import numpy as np
import pandas as pd

from .. import config
from ..warehouse import Warehouse
from . import actions, ranking, wording
from .detectors import access_gap, anomaly, regional, source_gap, trend, volume_vs_wait, weekday
from .model import Candidate, Skip, thresholds, thresholds_sha256
from .stats import benjamini_hochberg

ENGINE_VERSION = 1

# Raw tables behind each detector's marts: a blocking check on any of them skips the detector.
INPUT_TABLES = {
    "trend": ("moh_bed_waits",), "anomaly": ("moh_bed_waits",), "weekday": ("moh_bed_waits",),
    "volume_vs_wait": ("moh_bed_waits", "moh_ed_attendances"),
    "access_gap": ("chas_clinics", "pop_65plus_by_area", "planning_area_boundaries"),
    "regional": ("moh_bed_waits", "chas_clinics", "pop_65plus_by_area"),
    "source_gap": ("nuhs_live_waits", "moh_bed_waits"),
}
SOURCE_LABEL = {"chas_clinics": "the CHAS clinic list", "moh_bed_waits": "MOH's bed-wait figures",
                "moh_ed_attendances": "MOH's ED visit figures", "nuhs_live_waits": "the NUHS readings",
                "pop_65plus_by_area": "the population figures", "planning_area_boundaries": "the area boundaries"}

FCT_INSIGHT_DDL = """CREATE OR REPLACE TABLE marts.fct_insight (
    insight_id VARCHAR, type VARCHAR, entity VARCHAR, headline VARCHAR, detail VARCHAR, metric_value DOUBLE,
    unit VARCHAR, comparison_value DOUBLE, direction VARCHAR, effect_size DOUBLE, p_value DOUBLE, p_adjusted DOUBLE,
    n INTEGER, method VARCHAR, caveats VARCHAR[], who_acts VARCHAR, action VARCHAR,
    evidence STRUCT(endpoint VARCHAR, query VARCHAR), as_of DATE, as_of_basis VARCHAR, rank_score DOUBLE,
    headline_rank INTEGER)"""
COLUMNS = ["insight_id", "type", "entity", "headline", "detail", "metric_value", "unit", "comparison_value", "direction",
           "effect_size", "p_value", "p_adjusted", "n", "method", "caveats", "who_acts", "action", "evidence", "as_of",
           "as_of_basis", "rank_score", "headline_rank"]


@dataclass
class InsightRun:
    today: date
    insights: list[dict[str, Any]]
    candidates: list[Candidate]
    skips: list[Skip]
    extra: dict[str, Any] = field(default_factory=dict)
    tests: int = 0


# --------------------------------------------------------------------------- #
# Inputs
# --------------------------------------------------------------------------- #

def _q(wh: Warehouse, sql: str) -> pd.DataFrame:
    return wh.query(sql)


def load_inputs(wh: Warehouse) -> dict[str, pd.DataFrame]:
    return {
        "hospitals": _q(wh, "SELECT hospital_code, hospital_name, cluster, facility_type, reported_from, coverage_note "
                            "FROM marts.dim_hospital ORDER BY hospital_code"),
        "weekly": _q(wh, "SELECT hospital_code, week_start, week_end, mean_of_daily_median_wait_hours, total_attendances, "
                         "is_complete_week FROM marts.fct_ed_weekly"),
        "daily": _q(wh, "SELECT hospital_code, report_date, median_wait_hours, attendances, is_complete_week FROM marts.fct_ed_daily"),
        "areas": _q(wh, "SELECT planning_area, residents_65plus, cdmp_clinics, cdmp_clinics_per_1k_seniors, clinics_as_of AS as_of "
                        "FROM marts.fct_area_access"),
        "live": _q(wh, "SELECT hospital_code, is_adult_ed, est_bed_wait_hours, snapshot_at FROM marts.fct_live_ed_snapshot"),
    }


def failed_checks(wh: Warehouse, run_id: str | None) -> pd.DataFrame:
    if run_id is None:
        return pd.DataFrame(columns=["check_id", "table", "severity", "scope", "failing_rows", "blocks_publish"])
    return wh.con.execute('SELECT check_id, "table", severity, scope, failing_rows, blocks_publish FROM dq_results '
                          "WHERE run_id = ? AND status = 'fail'", [run_id]).df()


def forbidden_words(wh: Warehouse) -> frozenset[str]:
    """Every snake_case mart column: none may appear in a headline or detail."""
    cols = wh.query("SELECT DISTINCT column_name FROM information_schema.columns WHERE table_schema = 'marts'")
    return frozenset(c for c in cols["column_name"] if "_" in c)


# --------------------------------------------------------------------------- #
# Run
# --------------------------------------------------------------------------- #

def run(inputs: dict[str, pd.DataFrame], failed: pd.DataFrame, today: date,
        forbidden: frozenset[str] = frozenset()) -> InsightRun:
    cfg = thresholds()
    eng = cfg["engine"]
    min_c = float(eng["min_completeness"])
    norm = cfg["ranking"]["normalise"]
    blocking = failed[failed["blocks_publish"].astype(bool)] if len(failed) else failed
    quarantined = failed[(failed["severity"] == "ERROR") & ~failed["blocks_publish"].astype(bool)] if len(failed) else failed

    h, w, d = inputs["hospitals"], inputs["weekly"], inputs["daily"]
    runners = {
        "trend": lambda: trend.detect(w, h, cfg["trend"], min_c),
        "anomaly": lambda: anomaly.detect(w, h, cfg["anomaly"], min_c, float(norm["anomaly_z_full"])),
        "weekday": lambda: weekday.detect(d, w, h, cfg["weekday"], min_c, float(norm["weekday_eps2_full"])),
        "volume_vs_wait": lambda: volume_vs_wait.detect(d, w, h, cfg["volume_vs_wait"], min_c),
        "access_gap": lambda: access_gap.detect(inputs["areas"], cfg["access_gap"], min_c),
        "regional": lambda: regional.detect(cfg["regional"]),
        "source_gap": lambda: source_gap.detect(inputs["live"], d, cfg["source_gap"], float(norm["source_gap_hours_full"])),
    }
    candidates: list[Candidate] = []
    skips: list[Skip] = []
    extra: dict[str, Any] = {}
    for name, runner in runners.items():
        blocked = blocking[blocking["table"].isin(INPUT_TABLES[name])] if len(blocking) else blocking
        if len(blocked):
            reasons = "; ".join(f"{r.check_id} on {r.table}" for r in blocked.itertuples())
            skips.append(Skip(name, "all", f"a check that blocks publishing failed on its inputs: {reasons}"))
            continue
        result = runner()
        q = quarantined[quarantined["table"].isin(INPUT_TABLES[name])] if len(quarantined) else quarantined
        notes = [f"{int(r.failing_rows):,d} {'record' if int(r.failing_rows) == 1 else 'records'} in "
                 f"{SOURCE_LABEL.get(r.table, 'the source')} {'was' if int(r.failing_rows) == 1 else 'were'} set aside by "
                 "data checks." for r in q.itertuples()]
        for c in result.candidates:
            c.caveats.extend(notes)
        candidates += result.candidates
        skips += result.skips
        extra.update(result.extra)

    # A test that couldn't be computed (NaN) is never published.
    for c in candidates:
        if c.p_value is not None and not np.isfinite(c.p_value):
            c.p_value, c.passes_effect, c.reason = None, False, "the test could not be computed"
    # Benjamini-Hochberg across every p-value in this run.
    tested = [c for c in candidates if c.p_value is not None]
    for c, padj in zip(tested, benjamini_hochberg([c.p_value for c in tested])):     # type: ignore[misc]
        c.p_adjusted = padj

    alpha = float(eng["alpha"])
    passing: list[Candidate] = []
    for c in candidates:
        if not c.passes_effect:
            c.reason = "effect below the detector's minimum"
        elif c.p_adjusted is not None and c.p_adjusted >= alpha:
            c.reason = f"not significant after correction (adjusted p {c.p_adjusted:.3f})"
        else:
            passing.append(c)
    # One insight per detector and entity: the strongest (e.g. the best of three lags).
    best: dict[tuple[str, str], Candidate] = {}
    for c in passing:
        key = (c.type, c.entity)
        if key not in best or c.effect_norm > best[key].effect_norm:
            if key in best:
                best[key].reason = "a stronger result for the same hospital was published"
            best[key] = c
        else:
            c.reason = "a stronger result for the same hospital was published"

    dates = source_dates(inputs)
    rows = [_row(c, today, forbidden, dates) for c in sorted(best.values(), key=lambda c: (c.type, c.entity))]
    for c in best.values():
        c.reason = "published"
    ranks = ranking.headline_ranks(rows)
    for r in rows:
        r["headline_rank"] = ranks.get(r["insight_id"])
    rows.sort(key=ranking.order)
    return InsightRun(today=today, insights=rows, candidates=candidates, skips=skips, extra=extra, tests=len(tested))


def source_dates(inputs: dict[str, pd.DataFrame]) -> dict[str, date]:
    """How current each source is (for the recency weight): its latest data, not the analysis window."""
    out: dict[str, date] = {}
    def latest(s: pd.Series) -> date | None:
        s = pd.to_datetime(s).dropna()
        return None if s.empty else s.max().date()
    for key, value in (("moh_bed_waits", latest(inputs["daily"]["report_date"])),
                       ("datagov_chas", latest(inputs["areas"]["as_of"])),
                       ("nuhs_live", latest(inputs["live"]["snapshot_at"]))):
        if value:
            out[key] = value
    return out


def _row(c: Candidate, today: date, forbidden: frozenset[str], dates: dict[str, date] | None = None) -> dict[str, Any]:
    values = {**c.values, "p": wording.p_text(c.p_adjusted) if c.p_adjusted is not None else ""}
    headline, detail = wording.render(c.type, c.variant, values, forbidden)
    who, act, note = actions.action_for(c.type, c.action_key, c.action_values)
    caveats = [*c.caveats, *([note] if note else [])]
    for text in caveats:
        if wording.CAUSAL.search(text):
            raise wording.WordingError(f"causal word in a caveat: {text!r}")
    recency = ranking.recency_weight(c.source, (dates or {}).get(c.source, c.as_of), today)
    return {
        "insight_id": c.insight_id, "type": c.type, "entity": c.entity, "headline": headline, "detail": detail,
        "metric_value": _round(c.metric_value), "unit": c.unit, "comparison_value": _round(c.comparison_value),
        "direction": c.direction, "effect_size": _round(c.effect_size), "p_value": _round(c.p_value, 6),
        "p_adjusted": _round(c.p_adjusted, 6), "n": c.n, "method": c.method, "caveats": caveats, "who_acts": who,
        "action": act, "evidence": c.evidence, "as_of": c.as_of,
        "as_of_basis": "source_updated" if c.source == "datagov_chas" else "latest_data",
        "rank_score": ranking.rank_score(c.effect_norm, c.p_adjusted, c.completeness, recency), "headline_rank": None,
    }


def _round(v: float | None, digits: int = 4) -> float | None:
    return None if v is None or pd.isna(v) else round(float(v), digits)


# --------------------------------------------------------------------------- #
# Outputs
# --------------------------------------------------------------------------- #

def write_mart(wh: Warehouse, result: InsightRun) -> int:
    wh.con.execute("CREATE SCHEMA IF NOT EXISTS marts")
    wh.con.execute(FCT_INSIGHT_DDL)
    for r in result.insights:
        wh.con.execute(f"INSERT INTO marts.fct_insight VALUES ({', '.join('?' for _ in COLUMNS)})",
                       [r[c] for c in COLUMNS])
    return len(result.insights)


def log_skips(wh: Warehouse, run_id: str, skips: list[Skip]) -> int:
    """Each skipped detector, hospital or area becomes a dq_results row in the validation run."""
    if not skips:
        return 0
    now = config.now_sgt()
    slug = lambda s: re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")
    df = pd.DataFrame([{"check_id": f"insight.{s.type}.{slug(s.entity)}", "table": "fct_insight", "severity": "WARN",
                        "status": "skipped", "failing_rows": 0, "details": s.reason, "run_id": run_id, "checked_at": now,
                        "scope": "dataset", "blocks_publish": False} for s in skips])
    wh.upsert("dq_results", df.drop_duplicates(["check_id"]), ["run_id", "check_id", "table"])
    return len(df)


def to_json(result: InsightRun) -> dict[str, Any]:
    cfg = thresholds()
    def clean(r: dict[str, Any]) -> dict[str, Any]:
        return {k: (v.isoformat() if isinstance(v, date) else v) for k, v in r.items()}
    return {
        "engine_version": ENGINE_VERSION,
        "run_date": result.today.isoformat(),
        "thresholds_sha256": thresholds_sha256(),
        "alpha": cfg["engine"]["alpha"],
        "tests_in_correction": result.tests,
        "headline_findings": [clean(r) for r in sorted((r for r in result.insights if r["headline_rank"]),
                                                       key=lambda r: r["headline_rank"])],
        "insights": [clean(r) for r in result.insights],
        "excluded_areas": result.extra.get("excluded_areas", []),
        "national_cdmp_per_1k_seniors": result.extra.get("national_cdmp_per_1k_seniors"),
        "skipped": [{"type": s.type, "entity": s.entity, "reason": s.reason} for s in result.skips],
        "candidates": [{"type": c.type, "entity": c.entity, "variant": c.variant, "n": c.n,
                        "effect_size": _round(c.effect_size), "p_value": _round(c.p_value, 6),
                        "p_adjusted": _round(c.p_adjusted, 6), "outcome": c.reason or "published"}
                       for c in sorted(result.candidates, key=lambda c: (c.type, c.entity, c.variant))],
    }


def run_in_warehouse(wh: Warehouse, run_id: str | None, today: date | None = None) -> InsightRun:
    """Load, run, write the mart and log skips into run_id (the validation run being published)."""
    today = today or config.now_sgt().date()
    result = run(load_inputs(wh), failed_checks(wh, run_id), today, forbidden_words(wh))
    write_mart(wh, result)
    if run_id:
        log_skips(wh, run_id, result.skips)
    return result
