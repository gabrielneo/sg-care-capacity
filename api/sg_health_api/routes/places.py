"""/clinics and /areas/access: CHAS clinics and access for residents aged 65+, by planning area."""
from __future__ import annotations

import json
import math
from typing import Any

from fastapi import APIRouter, Depends, Query, Response

from ..context import Context
from ..errors import ApiError
from ..models import AreaCollection, AreasResponse, Clinic, ClinicPage, ClinicsResponse
from ..snapshot import GEOJSON
from . import ERRORS, get_ctx

router = APIRouter(tags=["clinics and planning areas"], responses=ERRORS)

DEFAULT_LIMIT, MAX_LIMIT = 100, 500
AREA_SOURCES = ("datagov_chas", "singstat_residents", "datagov_planning_areas", "datagov_polyclinics")
AREA_TABLES = ("chas_clinics", "pop_65plus_by_area", "planning_area_boundaries", "polyclinics")

_CLINIC_FILTER = """
    FROM marts.dim_clinic
    WHERE is_active
      AND (CAST(? AS BOOLEAN) IS NULL OR has_cdmp = CAST(? AS BOOLEAN))
      AND (CAST(? AS DOUBLE) IS NULL OR (longitude BETWEEN ? AND ? AND latitude BETWEEN ? AND ?))
"""
CLINICS_SQL = """
    SELECT clinic_key, hci_code, clinic_name, address, postal_code, latitude, longitude, programmes, has_cdmp,
           planning_area_code, planning_area, source_sha256, as_of, as_of_basis
""" + _CLINIC_FILTER + "ORDER BY clinic_name, clinic_key LIMIT ? OFFSET ?"
CLINICS_COUNT_SQL = "SELECT count(*) AS n" + _CLINIC_FILTER
CLINIC_TOTALS_SQL = "SELECT count(*) FILTER (WHERE is_active) AS active, count(*) FILTER (WHERE NOT is_active) AS inactive FROM marts.dim_clinic"
AREA_AS_OF_SQL = "SELECT min(as_of) AS as_of FROM marts.fct_area_access"


def parse_bbox(value: str | None) -> tuple[float, float, float, float] | None:
    if value is None:
        return None
    parts = value.split(",")
    try:
        nums = [float(p) for p in parts]
    except ValueError:
        nums = []
    if len(nums) != 4 or not all(math.isfinite(n) for n in nums):
        raise ApiError(400, "invalid_bbox", f"bbox must be minLon,minLat,maxLon,maxLat (got {value!r})", "bbox")
    min_lon, min_lat, max_lon, max_lat = nums
    if not (-180 <= min_lon < max_lon <= 180 and -90 <= min_lat < max_lat <= 90):
        raise ApiError(400, "invalid_bbox", "bbox needs -180 <= minLon < maxLon <= 180 and -90 <= minLat < maxLat <= 90 "
                       f"(got {value!r})", "bbox")
    return min_lon, min_lat, max_lon, max_lat


@router.get("/clinics", response_model=ClinicsResponse, summary="Active CHAS clinics, paged")
def clinics(
    ctx: Context = Depends(get_ctx),
    cdmp: bool | None = Query(None, description="true: CDMP clinics only; false: clinics known not to be in CDMP "
                                                "(clinics with no programme list are in neither)"),
    bbox: str | None = Query(None, description="minLon,minLat,maxLon,maxLat (WGS84)", examples=["103.6,1.2,104.1,1.5"]),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT, description=f"Page size, 1-{MAX_LIMIT}"),
    offset: int = Query(0, ge=0, le=1_000_000),
) -> ClinicsResponse:
    box = parse_bbox(bbox)
    flag = (cdmp, cdmp)
    area: tuple[float | None, ...] = (None, None, None, None, None) if box is None else (box[0], box[0], box[2], box[1], box[3])
    filters = [*flag, *area]
    rows = ctx.snap.query(CLINICS_SQL, [*filters, limit, offset])
    total = ctx.snap.query(CLINICS_COUNT_SQL, filters)[0]["n"]
    if "clinic_totals" not in ctx.cache:
        ctx.cache["clinic_totals"] = ctx.snap.query(CLINIC_TOTALS_SQL)[0]
    totals = ctx.cache["clinic_totals"]
    chas = ctx.sources.get("datagov_chas")
    updated = (chas.as_of or "")[:10] if chas else "unknown"
    return ClinicsResponse(
        data=ClinicPage(items=[Clinic(**r) for r in rows], total=total, limit=limit, offset=offset),
        meta=ctx.meta(as_of=chas.as_of if chas else None, sources=("datagov_chas",),
                      coverage={"total_matching": total, "returned": len(rows), "active_clinics": totals["active"],
                                "inactive_clinics_excluded": totals["inactive"]},
                      caveats=[f"The CHAS clinic list was last updated by data.gov.sg on {updated}; clinics that "
                               "opened or closed since are not reflected.",
                               "Only active clinics (those in the latest CHAS file) are listed."],
                      tables=("chas_clinics",)))


def warm(ctx: Context) -> None:
    """Validate the map layer at startup and keep the whole response, which never changes, as bytes."""
    raw: dict[str, Any] = json.loads(ctx.snap.file(GEOJSON).read_text())
    AreaCollection.model_validate(raw)                   # a malformed layer stops startup
    feats = [f["properties"] for f in raw["features"]]
    meta = ctx.meta(as_of=ctx.snap.query(AREA_AS_OF_SQL)[0]["as_of"], sources=AREA_SOURCES,
                    coverage={"planning_areas": len(feats),
                              "with_population": sum(1 for p in feats if p.get("residents_total") is not None),
                              "with_a_dq_note": sum(1 for p in feats if p.get("dq_note"))},
                    caveats=[*ctx.metric_caveats("fct_area_access."),
                             "Missing values are null: show them as 'no data', never as 0 or the lowest class.",
                             "as_of is the older of the clinic list and the population reference date."],
                    tables=AREA_TABLES)
    body = {"data": raw, "meta": meta.model_dump(mode="json")}
    ctx.cache["areas"] = json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode()


@router.get("/areas/access", response_model=AreasResponse,
            summary="Clinic access for residents aged 65+ by planning area (GeoJSON in data)")
def areas_access(ctx: Context = Depends(get_ctx)) -> Response:
    if "areas" not in ctx.cache:
        warm(ctx)
    return Response(content=ctx.cache["areas"], media_type="application/json")
