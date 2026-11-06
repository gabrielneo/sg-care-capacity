"""Table-specific checks run inside the load gate. Each is registered in model.CHECKS.

Thresholds are named constants here; docs/data_quality.md explains each one.
"""
from __future__ import annotations

import pandas as pd

from ..config import HOSPITAL_REFERENCE
from .gate import GateContext, rule
from .model import Scope, Severity, register

MOH_TABLES = ("moh_bed_waits", "moh_ed_attendances")

BED_WAIT_MAX_HOURS = 72          # above this, or below 0: impossible, ERROR
BED_WAIT_WARN_HOURS = 24         # above this: possible but exceptional, WARN

# --------------------------------------------------------------------------- #
# Domain
# --------------------------------------------------------------------------- #

HOSPITAL_CODE = register(
    "domain.hospital_code", Severity.ERROR, Scope.ROW,
    "hospital_code is in the reference list of MOH-reported EDs")
NOT_FUTURE = register(
    "domain.report_date_not_future", Severity.ERROR, Scope.ROW,
    "report_date is not after the date the file was fetched")
UNRECOGNISED_COLUMN = register(
    "domain.unrecognised_hospital_column", Severity.WARN, Scope.FILE,
    "Every hospital column in an MOH sheet maps to a known hospital")


@rule(*MOH_TABLES)
def hospital_code_known(df: pd.DataFrame, ctx: GateContext):
    bad = ~df["hospital_code"].isin(HOSPITAL_REFERENCE)
    return [(HOSPITAL_CODE.check_id, bad, "hospital_code " + df["hospital_code"].astype(str) + " is not in the reference list")]


@rule(*MOH_TABLES)
def report_date_not_future(df: pd.DataFrame, ctx: GateContext):
    # "Future" is relative to when the file was fetched, not to today: a figure dated after its
    # own download is impossible, and this keeps reparse independent of the clock.
    fetched = ctx.rec.fetched_at.date()
    dates = pd.to_datetime(df["report_date"], errors="coerce").dt.date
    bad = dates.notna() & (dates > fetched)
    return [(NOT_FUTURE.check_id, bad, "report_date " + dates.astype(str) + f" is after the fetch date {fetched}")]


@rule(*MOH_TABLES)
def no_unrecognised_columns(df: pd.DataFrame, ctx: GateContext):
    cols = (ctx.attrs or {}).get("unrecognised_columns", [])
    return [(UNRECOGNISED_COLUMN.check_id, len(cols), f"columns not mapped to any hospital: {cols}")]


# --------------------------------------------------------------------------- #
# Ranges
# --------------------------------------------------------------------------- #

BED_WAIT_BOUNDS = register(
    "range.bed_wait_bounds", Severity.ERROR, Scope.ROW,
    f"0 <= median_wait_hours <= {BED_WAIT_MAX_HOURS}")
BED_WAIT_OVER_24H = register(
    "range.bed_wait_over_24h", Severity.WARN, Scope.ROW,
    f"median_wait_hours above {BED_WAIT_WARN_HOURS} is flagged for review")
ATTENDANCES_NEGATIVE = register(
    "range.attendances_negative", Severity.ERROR, Scope.ROW,
    "total_attendances is not negative")


@rule("moh_bed_waits")
def bed_wait_ranges(df: pd.DataFrame, ctx: GateContext):
    v = pd.to_numeric(df["median_wait_hours"], errors="coerce")
    text = "median_wait_hours = " + v.round(2).astype(str)
    out_of_bounds = (v < 0) | (v > BED_WAIT_MAX_HOURS)
    over_24 = (v > BED_WAIT_WARN_HOURS) & ~out_of_bounds
    return [(BED_WAIT_BOUNDS.check_id, out_of_bounds, text + f" is outside 0-{BED_WAIT_MAX_HOURS} h"),
            (BED_WAIT_OVER_24H.check_id, over_24, text + f" is above {BED_WAIT_WARN_HOURS} h")]


@rule("moh_ed_attendances")
def attendance_ranges(df: pd.DataFrame, ctx: GateContext):
    v = pd.to_numeric(df["total_attendances"], errors="coerce")
    return [(ATTENDANCES_NEGATIVE.check_id, v < 0, "total_attendances = " + v.astype(str) + " is negative")]
