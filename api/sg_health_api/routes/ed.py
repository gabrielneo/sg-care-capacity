"""/hospitals, /ed/daily, /ed/weekly, /ed/summary. MOH figures; see docs/data_dictionary.md."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query

from ..context import Context
from ..errors import ApiError
from ..models import (
    Change,
    EdDailyResponse,
    EdDay,
    EdSummary,
    EdSummaryResponse,
    EdWeek,
    EdWeeklyResponse,
    Hospital,
    HospitalsResponse,
    WeekRef,
)
from . import ERRORS, get_ctx

router = APIRouter(tags=["emergency departments"], responses=ERRORS)

MOH_SOURCES = ("moh_bed_waits", "moh_ed_attendances")
MOH_TABLES = ("moh_bed_waits", "moh_ed_attendances")
DEFAULT_DAYS = 90
MAX_YEARS = 2
DEFAULT_WEEKS, MAX_WEEKS = 12, 104
BASELINE_WEEKS = 4

DAILY_SQL = """
    SELECT hospital_code, hospital_name, report_date, iso_year, iso_week, median_wait_hours, attendances,
           is_complete_week, dq_flags, wait_source_url, wait_source_sha256, attendance_source_url,
           attendance_source_sha256, as_of, as_of_basis
    FROM marts.fct_ed_daily
    WHERE report_date BETWEEN ? AND ? AND (CAST(? AS VARCHAR) IS NULL OR hospital_code = ?)
    ORDER BY hospital_code, report_date
"""
LATEST_DAY_SQL = "SELECT max(report_date) AS d FROM marts.fct_ed_daily"
WEEKLY_SQL = """
    SELECT hospital_code, hospital_name, iso_year, iso_week, week_start, week_end, mean_of_daily_median_wait_hours,
           total_attendances, days_reported_wait, days_reported_attendances, is_complete_week, source_sha256,
           as_of, as_of_basis
    FROM marts.fct_ed_weekly
    WHERE week_start >= ? AND (CAST(? AS VARCHAR) IS NULL OR hospital_code = ?)
    ORDER BY hospital_code, week_start
"""
LATEST_WEEK_SQL = "SELECT max(week_start) AS d FROM marts.fct_ed_weekly"
ALL_WEEKS_SQL = """
    SELECT hospital_code, iso_year, iso_week, week_start, week_end, mean_of_daily_median_wait_hours,
           total_attendances, is_complete_week
    FROM marts.fct_ed_weekly ORDER BY hospital_code, week_start
"""


# --------------------------------------------------------------------------- #
# Shared
# --------------------------------------------------------------------------- #

def known_hospital(ctx: Context, code: str | None) -> str | None:
    if code is None:
        return None
    norm = code.strip().upper()
    if norm not in ctx.hospitals:
        raise ApiError(400, "unknown_hospital",
                       f"unknown hospital {code!r}; use one of {', '.join(sorted(ctx.hospitals))}", "hospital")
    return norm


def hospital_caveats(ctx: Context, codes: list[str]) -> list[str]:
    notes = [f"{c}: {ctx.hospitals[c]['coverage_note']}" for c in codes if ctx.hospitals[c].get("coverage_note")]
    exclusions = {ctx.hospitals[c]["exclusions_note"] for c in codes if ctx.hospitals[c].get("exclusions_note")}
    return notes + sorted(exclusions)


def ed_coverage(ctx: Context, codes: list[str], **extra: Any) -> dict[str, Any]:
    return {**extra, "hospitals": {c: ctx.coverage_per_hospital.get(c) for c in codes}}


def static(ctx: Context, key: str, sql: str) -> Any:
    if key not in ctx.cache:
        ctx.cache[key] = ctx.snap.query(sql)[0]["d"]
    return ctx.cache[key]


def add_years(d: date, years: int) -> date:
    try:
        return d.replace(year=d.year + years)
    except ValueError:                                     # 29 February
        return d.replace(year=d.year + years, day=28)


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #

@router.get("/hospitals", response_model=HospitalsResponse, summary="The sites MOH reports, with coverage notes")
def hospitals(ctx: Context = Depends(get_ctx)) -> HospitalsResponse:
    rows = list(ctx.hospitals.values())
    return HospitalsResponse(
        data=[Hospital(**r) for r in rows],
        meta=ctx.meta(as_of=max((r["as_of"] for r in rows), default=None), sources=MOH_SOURCES,
                      coverage={"hospitals": len(rows)}, caveats=hospital_caveats(ctx, list(ctx.hospitals)),
                      tables=()))


@router.get("/ed/daily", response_model=EdDailyResponse, summary="Daily bed waits and attendances")
def ed_daily(
    ctx: Context = Depends(get_ctx),
    hospital: str | None = Query(None, description="Hospital code, e.g. SGH (see /hospitals). Omit for all"),
    from_: date | None = Query(None, alias="from", description=f"First day (YYYY-MM-DD). Default: {DEFAULT_DAYS} days before `to`"),
    to: date | None = Query(None, description="Last day (YYYY-MM-DD). Default: the latest day MOH has published"),
) -> EdDailyResponse:
    code = known_hospital(ctx, hospital)
    latest = static(ctx, "latest_day", LATEST_DAY_SQL)
    end = to or latest or date.today()
    start = from_ or end - timedelta(days=DEFAULT_DAYS - 1)
    if start > end:
        raise ApiError(400, "invalid_range", f"from ({start}) is after to ({end})"
                       + ("" if to else f"; to defaults to the latest published day, {latest}"), "from")
    if end >= add_years(start, MAX_YEARS):
        raise ApiError(400, "range_too_long", f"from and to may be at most {MAX_YEARS} years apart "
                       f"(got {start} to {end}, {(end - start).days + 1} days)", "to")
    rows = ctx.snap.query(DAILY_SQL, [start, end, code, code])
    for r in rows:
        r["dq_flags"] = [f for f in (r["dq_flags"] or "").split(",") if f]
    codes = [code] if code else list(ctx.hospitals)
    return EdDailyResponse(
        data=[EdDay(**r) for r in rows],
        meta=ctx.meta(as_of=ctx.source_as_of(*MOH_SOURCES), sources=MOH_SOURCES,
                      coverage=ed_coverage(ctx, codes, **{"from": start.isoformat(), "to": end.isoformat(),
                                                          "rows": len(rows),
                                                          "latest_published_day": latest.isoformat() if latest else None}),
                      caveats=ctx.metric_caveats("fct_ed_daily.") + hospital_caveats(ctx, codes), tables=MOH_TABLES))


@router.get("/ed/weekly", response_model=EdWeeklyResponse, summary="ISO-week (Mon-Sun) aggregates")
def ed_weekly(
    ctx: Context = Depends(get_ctx),
    hospital: str | None = Query(None, description="Hospital code (see /hospitals). Omit for all"),
    weeks: int = Query(DEFAULT_WEEKS, ge=1, le=MAX_WEEKS, description=f"How many of the latest ISO weeks (1-{MAX_WEEKS})"),
) -> EdWeeklyResponse:
    code = known_hospital(ctx, hospital)
    latest = static(ctx, "latest_week", LATEST_WEEK_SQL)
    rows = [] if latest is None else ctx.snap.query(WEEKLY_SQL, [latest - timedelta(weeks=weeks - 1), code, code])
    codes = [code] if code else list(ctx.hospitals)
    return EdWeeklyResponse(
        data=[EdWeek(**r) for r in rows],
        meta=ctx.meta(as_of=ctx.source_as_of(*MOH_SOURCES), sources=MOH_SOURCES,
                      coverage=ed_coverage(ctx, codes, weeks=weeks, rows=len(rows),
                                           incomplete_weeks=sum(1 for r in rows if not r["is_complete_week"])),
                      caveats=ctx.metric_caveats("fct_ed_weekly.") + [
                          "total_attendances is a full-week total only when days_reported_attendances is 7; "
                          "a partial week is an undercount. The newest week is usually incomplete until MOH's "
                          "next weekly file.", *hospital_caveats(ctx, codes)],
                      tables=MOH_TABLES))


def _change(unit: str, latest: float | None, baseline: list[Any] | None) -> Change:
    if latest is None or baseline is None or any(v is None for v in baseline):
        return Change(unit=unit, latest=latest, baseline_mean=None, change=None, change_pct=None)
    mean = sum(v for v in baseline if v is not None) / len(baseline)
    diff = latest - mean
    return Change(unit=unit, latest=latest, baseline_mean=mean, change=diff,
                  change_pct=None if mean == 0 else diff / mean * 100)


def build_summary(ctx: Context) -> list[EdSummary]:
    weeks: dict[str, list[dict[str, Any]]] = {}
    for r in ctx.snap.query(ALL_WEEKS_SQL):
        weeks.setdefault(r["hospital_code"], []).append(r)
    latest_complete = {c: max((w for w in ws if w["is_complete_week"]), key=lambda w: w["week_start"], default=None)
                       for c, ws in weeks.items()}
    newest = max((w["week_start"] for w in latest_complete.values() if w), default=None)
    out = []
    for code, h in ctx.hospitals.items():
        latest = latest_complete.get(code)
        note = None
        base: list[dict[str, Any]] | None = None
        if latest is None:
            note = "No complete week (7 days of both metrics) in this snapshot."
        else:
            by_start = {w["week_start"]: w for w in weeks[code]}
            starts = [latest["week_start"] - timedelta(weeks=k) for k in range(BASELINE_WEEKS, 0, -1)]
            found = [by_start.get(s) for s in starts]
            if all(w is not None and w["is_complete_week"] for w in found):
                base = [w for w in found if w is not None]
            else:
                missing = [s.isoformat() for s, w in zip(starts, found, strict=True) if w is None or not w["is_complete_week"]]
                note = (f"Baseline not computed: the {BASELINE_WEEKS} weeks before the latest complete week are not "
                        f"all complete (incomplete or missing: {', '.join(missing)}).")
        out.append(EdSummary(
            hospital_code=code, hospital_name=h["hospital_name"], facility_type=h["facility_type"],
            latest_complete_week=None if latest is None else WeekRef(
                iso_year=latest["iso_year"], iso_week=latest["iso_week"], week_start=latest["week_start"],
                week_end=latest["week_end"]),
            is_current=latest is not None and latest["week_start"] == newest,
            baseline_weeks=[w["week_start"] for w in base] if base else [],
            mean_of_daily_median_wait_hours=_change(
                "hours", None if latest is None else latest["mean_of_daily_median_wait_hours"],
                None if base is None else [w["mean_of_daily_median_wait_hours"] for w in base]),
            total_attendances=_change(
                "patients", None if latest is None else latest["total_attendances"],
                None if base is None else [w["total_attendances"] for w in base]),
            note=note))
    return out


@router.get("/ed/summary", response_model=EdSummaryResponse,
            summary="Latest complete week per hospital vs the 4 complete weeks before it")
def ed_summary(ctx: Context = Depends(get_ctx)) -> EdSummaryResponse:
    if "summary" not in ctx.cache:
        ctx.cache["summary"] = build_summary(ctx)
    rows: list[EdSummary] = ctx.cache["summary"]
    return EdSummaryResponse(
        data=rows,
        meta=ctx.meta(as_of=ctx.source_as_of(*MOH_SOURCES), sources=MOH_SOURCES,
                      coverage=ed_coverage(ctx, list(ctx.hospitals),
                                           hospitals_with_a_complete_week=sum(1 for r in rows if r.latest_complete_week),
                                           hospitals_with_a_baseline=sum(1 for r in rows if r.baseline_weeks)),
                      caveats=[
                          "Latest week = the most recent ISO week (Monday to Sunday) with all 7 days of both metrics "
                          "for that hospital; a partial week is never compared. Baseline = the mean of the 4 ISO "
                          "weeks immediately before it, computed only if all 4 are complete.",
                          *ctx.metric_caveats("fct_ed_weekly."), *hospital_caveats(ctx, list(ctx.hospitals))],
                      tables=MOH_TABLES))
