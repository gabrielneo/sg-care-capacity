"""/insights: findings from the insight engine (docs/insights_method.md), as published in the snapshot."""
from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query

from ..context import Context
from ..models import Insight, InsightsResponse, InsightTest, InsightTestsResponse
from ..snapshot import SnapshotError
from . import ERRORS, get_ctx

router = APIRouter(tags=["insights"], responses=ERRORS)

InsightType = Literal["trend", "anomaly", "usual_gap", "weekday", "volume_vs_wait", "monthly_yoy", "access_gap", "regional", "source_gap"]

INSIGHTS_SQL = "SELECT * FROM marts.fct_insight ORDER BY rank_score DESC, insight_id"
# Columns added over time. A release from before one of them still serves its insights, with nulls there.
LATER_COLUMNS = ("period_start", "period_end", "strength", "display", "chart", "scope", "evidence_level", "n_unit",
                 "ci_low", "ci_high")
HAS_TABLE_SQL = "SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = 'marts' AND table_name = 'fct_insight'"
COLUMNS_SQL = "SELECT column_name FROM information_schema.columns WHERE table_schema = 'marts' AND table_name = 'fct_insight'"
SOURCES_BY_TYPE = {
    "trend": ("moh_bed_waits",), "anomaly": ("moh_bed_waits",), "usual_gap": ("moh_bed_waits",), "weekday": ("moh_bed_waits",),
    "volume_vs_wait": ("moh_bed_waits", "moh_ed_attendances"),
    "monthly_yoy": ("moh_bed_waits", "moh_ed_attendances"),
    "access_gap": ("datagov_chas", "singstat_residents", "datagov_planning_areas"),
    "regional": ("moh_bed_waits", "datagov_chas", "singstat_residents"), "source_gap": ("nuhs_live", "moh_bed_waits"),
}
# The warehouse tables each detector reads (the pipeline's insights.engine.INPUT_TABLES; a pipeline
# test keeps the two equal). A finding's data-quality warnings are those on these tables only.
TABLES_BY_TYPE = {
    "trend": ("moh_bed_waits",), "anomaly": ("moh_bed_waits",), "usual_gap": ("moh_bed_waits",), "weekday": ("moh_bed_waits",),
    "volume_vs_wait": ("moh_bed_waits", "moh_ed_attendances"),
    "monthly_yoy": ("moh_bed_waits", "moh_ed_attendances"),
    "access_gap": ("chas_clinics", "pop_65plus_by_area", "planning_area_boundaries"),
    "regional": ("moh_bed_waits", "chas_clinics", "pop_65plus_by_area"),
    "source_gap": ("nuhs_live_waits", "moh_bed_waits"),
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
            ctx.cache["insights"] = [{**{c: None for c in LATER_COLUMNS if c not in cols}, **r} for r in ctx.snap.query(INSIGHTS_SQL)]
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
        data=[Insight(**r, source_ids=list(SOURCES_BY_TYPE[r["type"]]), dq_tables=list(TABLES_BY_TYPE[r["type"]]))
              for r in rows],
        # Only the warnings on the tables these findings use (an ED finding isn't affected by a clinic check).
        meta=ctx.meta(as_of=as_of, sources=sources, caveats=notes,
                      tables=sorted({t for ty in types for t in TABLES_BY_TYPE[ty]}),
                      coverage={"insights": len(rows), "in_release": len(_all(ctx) or [])}),
    )


INSIGHTS_JSON = "insights.json"


def _tests(ctx: Context) -> dict[str, Any] | None:
    """insights.json from the release, or None if this release has none."""
    if "insight_tests" not in ctx.cache:
        try:
            ctx.cache["insight_tests"] = json.loads(ctx.snap.file(INSIGHTS_JSON).read_text())
        except SnapshotError:
            ctx.cache["insight_tests"] = None
    return ctx.cache["insight_tests"]


@router.get("/insights/tests", response_model=InsightTestsResponse,
            summary="Every result the insight engine weighed, published or not, with why")
def insight_tests(
    ctx: Context = Depends(get_ctx),
    type: InsightType | None = Query(None, description="Only this detector"),
) -> InsightTestsResponse:
    raw = _tests(ctx)
    notes = ["Every test and check the engine ran on this data release, including those that found nothing.",
             "Adjusted p-values are corrected across every test in the run (Benjamini-Hochberg)."]
    if raw is None:
        notes.append("This data release has no list of the engine's tests.")
    fields = InsightTest.model_fields
    rows = [{k: v for k, v in c.items() if k in fields} for c in (raw or {}).get("candidates", [])]
    if type:
        rows = [r for r in rows if r["type"] == type]
    types = sorted({r["type"] for r in rows}) or ([type] if type else list(SOURCES_BY_TYPE))
    published = [r for r in (_all(ctx) or []) if r["type"] in types]
    as_of = max((r["as_of"] for r in published), default=None) or ctx.created_at
    return InsightTestsResponse(
        data=[InsightTest(**r, source_ids=list(SOURCES_BY_TYPE[r["type"]]), dq_tables=list(TABLES_BY_TYPE[r["type"]]))
              for r in rows],
        meta=ctx.meta(as_of=as_of, sources=sorted({s for t in types for s in SOURCES_BY_TYPE[t]}), caveats=notes,
                      tables=sorted({t for ty in types for t in TABLES_BY_TYPE[ty]}),
                      coverage={"results": len(rows), "tests_in_correction": (raw or {}).get("tests_in_correction"),
                                "alpha": (raw or {}).get("alpha")}),
    )
