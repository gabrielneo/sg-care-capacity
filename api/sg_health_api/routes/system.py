"""/meta and /health."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from .. import API_VERSION
from ..context import Context
from ..models import CheckSummary, Health, HealthResponse, MetaResponse, SnapshotInfo
from . import get_ctx

router = APIRouter(tags=["snapshot"])


@router.get("/meta", response_model=MetaResponse, summary="The snapshot being served")
def meta(ctx: Context = Depends(get_ctx)) -> MetaResponse:
    m = ctx.snap.manifest
    checks = m.get("checks", {})
    data = SnapshotInfo(snapshot_id=ctx.snapshot_id, release_tag=ctx.snap.release_tag,
                        release_url=ctx.snap.release_url, created_at=ctx.created_at,
                        pipeline_commit=m.get("pipeline_commit"), api_version=API_VERSION,
                        row_counts={k: int(v) for k, v in m["row_counts"].items()},
                        checks=CheckSummary(blocking=int(checks.get("blocking", 0)),
                                            counts={k: int(v) for k, v in checks.get("counts", {}).items()}))
    return MetaResponse(data=data, meta=ctx.meta(
        as_of=ctx.created_at, sources=ctx.sources, tables=None,
        coverage={"hospitals": ctx.coverage_per_hospital, "row_counts": data.row_counts},
        caveats=["Data are refreshed weekly. Every response from this API describes this one snapshot."]))


@router.get("/health", response_model=HealthResponse, summary="Liveness, and which snapshot is loaded")
def health(ctx: Context = Depends(get_ctx)) -> HealthResponse:
    return HealthResponse(data=Health(status="ok", snapshot_id=ctx.snapshot_id),
                          meta=ctx.meta(as_of=ctx.created_at, coverage=None))
