"""/insights: findings from the insight engine (docs/insights_method.md), as published in the snapshot."""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, Query

from ..context import Context
from ..models import Insight, InsightsResponse
from . import ERRORS, get_ctx

router = APIRouter(tags=["insights"], responses=ERRORS)

InsightType = Literal["trend", "anomaly", "weekday", "volume_vs_wait", "access_gap", "regional", "source_gap"]

INSIGHTS_SQL = """
    SELECT insight_id, type, entity, headline, detail, metric_value, unit, comparison_value, direction, effect_size,
           p_value, p_adjusted, n, method, caveats, who_acts, action, evidence, as_of, as_of_basis, rank_score,
           headline_rank, display, chart
    FROM marts.fct_insight ORDER BY rank_score DESC, insight_id
"""
# Releases from before the engine wrote display and chart still serve their insights, with nulls.
INSIGHTS_BEFORE_CHARTS_SQL = """
    SELECT insight_id, type, entity, headline, detail, metric_value, unit, comparison_value, direction, effect_size,
           p_value, p_adjusted, n, method, caveats, who_acts, action, evidence, as_of, as_of_basis, rank_score,
           headline_rank, NULL AS display, NULL AS chart
    FROM marts.fct_insight ORDER BY rank_score DESC, insight_id
"""
HAS_TABLE_SQL = "SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = 'marts' AND table_name = 'fct_insight'"
COLUMNS_SQL = "SELECT column_name FROM information_schema.columns WHERE table_schema = 'marts' AND table_name = 'fct_insight'"
SOURCES_BY_TYPE = {
    "trend": ("moh_bed_waits",), "anomaly": ("moh_bed_waits",), "weekday": ("moh_bed_waits",),
    "volume_vs_wait": ("moh_bed_waits", "moh_ed_attendances"),
    "access_gap": ("datagov_chas", "singstat_residents", "datagov_planning_areas"),
    "regional": ("moh_bed_waits", "datagov_chas", "singstat_residents"), "source_gap": ("nuhs_live", "moh_bed_waits"),
}
CAVEATS = [
    "Insights are computed by fixed rules from the published data. One that fails its statistical test is not published.",
    "They describe associations only.",
]


def _all(ctx: Context) -> list[dict[str, Any]] | None:
    """Every published insight, or None if this data release predates the insight engine."""
    if "insights" not in ctx.cache:
        present = ctx.snap.query(HAS_TABLE_SQL)[0]["n"] > 0
        if not present:
            ctx.cache["insights"] = None
        else:
            cols = {r["column_name"] for r in ctx.snap.query(COLUMNS_SQL)}
            if {"display", "chart"} <= cols:
                ctx.cache["insights"] = ctx.snap.query(INSIGHTS_SQL)
            else:
                ctx.cache["insights"] = ctx.snap.query(INSIGHTS_BEFORE_CHARTS_SQL)
    return ctx.cache["insights"]


@router.get("/insights", response_model=InsightsResponse, summary="Findings that passed their statistical gates")
def insights(
    ctx: Context = Depends(get_ctx),
    type: InsightType | None = Query(None, description="Only this detector"),
    entity: str | None = Query(None, max_length=80, description="Only this hospital code or planning area (case-insensitive)"),
    top: int | None = Query(None, ge=1, le=100, description="The N highest rank_score"),
    headline: bool = Query(False, description="Only the headline findings (top 3, at most one per detector)"),
) -> InsightsResponse:
    rows = _all(ctx)
    notes = list(CAVEATS)
    if rows is None:
        rows = []
        notes.append("This data release was published before the insight engine existed, so it has no insights.")
    if type:
        rows = [r for r in rows if r["type"] == type]
    if entity:
        rows = [r for r in rows if r["entity"].lower() == entity.strip().lower()]
    if headline:
        rows = sorted((r for r in rows if r["headline_rank"]), key=lambda r: r["headline_rank"])
    if top:
        rows = rows[:top]
    if any(r["action"] is None for r in rows):
        notes.append("A suggested action appears only after the author has reviewed it.")
    if any(r["chart"] is None for r in rows):
        notes.append("Some insights have no chart data: this data release predates it.")
    types = sorted({r["type"] for r in rows}) or ([type] if type else list(SOURCES_BY_TYPE))
    sources = sorted({s for t in types for s in SOURCES_BY_TYPE[t]})
    as_of = max((r["as_of"] for r in rows), default=None) or ctx.created_at
    return InsightsResponse(
        data=[Insight(**r, source_ids=list(SOURCES_BY_TYPE[r["type"]])) for r in rows],
        meta=ctx.meta(as_of=as_of, sources=sources, caveats=notes, tables=None,
                      coverage={"insights": len(rows), "in_release": len(_all(ctx) or [])}),
    )
