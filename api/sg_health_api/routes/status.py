"""/quality (latest check results) and /live/nuhs/latest (NUHS readings in the snapshot)."""
from __future__ import annotations

from collections import Counter
from datetime import datetime

from fastapi import APIRouter, Depends

from ..context import Context
from ..models import LiveReading, LiveResponse, QualityReport, QualityResponse, QualityResult
from . import get_ctx

router = APIRouter(tags=["quality and live"])

LIVE_SQL = """
    SELECT hospital_code, site_name, department, is_adult_ed, measure_type, patients_waiting,
           est_wait_to_see_doctor_hours, est_bed_wait_hours, snapshot_at, source_updated_at, source_url,
           source_sha256, as_of, as_of_basis
    FROM marts.fct_live_ed_snapshot
    QUALIFY row_number() OVER (PARTITION BY site_name, department ORDER BY snapshot_at DESC) = 1
    ORDER BY hospital_code NULLS LAST, site_name, department
"""


@router.get("/quality", response_model=QualityResponse, summary="Data-quality results behind this snapshot")
def quality(ctx: Context = Depends(get_ctx)) -> QualityResponse:
    run = ctx.latest_run
    results = [QualityResult(check_id=r["check_id"], table=r["table"], severity=r["severity"], status=r["status"],
                             failing_rows=int(r["failing_rows"] or 0), scope=r["scope"],
                             blocks_publish=bool(r["blocks_publish"]), details=r["details"] or None) for r in run]
    checked_at = run[0]["checked_at"] if run else None
    report = QualityReport(run_id=run[0]["run_id"] if run else "", checked_at=checked_at or datetime.fromisoformat(ctx.created_at),
                           blocking=sum(1 for r in results if r.status == "fail" and r.blocks_publish),
                           counts=dict(Counter(r.status for r in results)), results=results)
    return QualityResponse(data=report, meta=ctx.meta(
        as_of=checked_at, sources=ctx.sources, coverage={"checks": len(results)}, tables=None,
        caveats=["Results of the validation run that published this snapshot. Every check that blocks "
                 "publishing passed; a failed row-level ERROR means those rows were quarantined (left out of "
                 "the data), not corrected. Definitions: docs/data_quality.md."]))


@router.get("/live/nuhs/latest", response_model=LiveResponse,
            summary="Latest NUHS ED wait estimates in the snapshot (not a live feed)")
def live_nuhs_latest(ctx: Context = Depends(get_ctx)) -> LiveResponse:
    if "live" not in ctx.cache:
        ctx.cache["live"] = [LiveReading(**r) for r in ctx.snap.query(LIVE_SQL)]
    rows: list[LiveReading] = ctx.cache["live"]
    newest = max((r.as_of for r in rows), default=None)
    oldest = min((r.snapshot_at for r in rows), default=None)
    return LiveResponse(data=rows, meta=ctx.meta(
        as_of=newest or ctx.source_as_of("nuhs_live"),
        sources=("nuhs_live",),
        coverage={"readings": len(rows), "sites": len({r.site_name for r in rows}),
                  "oldest_snapshot_at": oldest.isoformat() if oldest else None},
        caveats=[f"From the weekly snapshot, not a live feed: the newest reading was taken at "
                 f"{newest.isoformat() if newest else 'an unknown time'} and may be up to 7 days old.",
                 "Only NUHS publishes these estimates (AH, NUH, NTFGH). NUH lists Adult and Children's Emergency "
                 "separately: filter on is_adult_ed for one reading per hospital.",
                 "Each site's latest reading is shown; a site missing from later snapshots keeps an older one "
                 "(compare snapshot_at).",
                 *ctx.metric_caveats("fct_live_ed_snapshot.")],
        tables=("nuhs_live_waits",)))
