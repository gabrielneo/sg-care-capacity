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
    "hospital_code is in the reference list of MOH-reported EDs", tables=MOH_TABLES)
NOT_FUTURE = register(
    "domain.report_date_not_future", Severity.ERROR, Scope.ROW,
    "report_date is not after the date the file was fetched", tables=MOH_TABLES)
UNRECOGNISED_COLUMN = register(
    "domain.unrecognised_hospital_column", Severity.WARN, Scope.FILE,
    "Every hospital column in an MOH sheet maps to a known hospital", tables=MOH_TABLES)


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
    f"0 <= median_wait_hours <= {BED_WAIT_MAX_HOURS}", tables=("moh_bed_waits",))
BED_WAIT_OVER_24H = register(
    "range.bed_wait_over_24h", Severity.WARN, Scope.ROW,
    f"median_wait_hours above {BED_WAIT_WARN_HOURS} is flagged for review", tables=("moh_bed_waits",))
ATTENDANCES_NEGATIVE = register(
    "range.attendances_negative", Severity.ERROR, Scope.ROW,
    "total_attendances is not negative", tables=("moh_ed_attendances",))


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


# --------------------------------------------------------------------------- #
# Unit sanity (minutes vs hours)
# --------------------------------------------------------------------------- #
# The parser decides a sheet's unit from its header, or from the size of the numbers if the
# header says nothing (MOH's doesn't). A wrong decision changes every value in that sheet by
# exactly 60x. Two file-level checks catch that, per sheet:
#   1. MOH repeats its full history in every weekly file, so a sheet can be compared with the
#      values already stored for the same hospitals and dates: same units give a ratio of ~1.
#   2. When there is nothing to compare with (first load, or a brand-new week), the sheet's
#      overall median must be a plausible number of hours.
# A hospital's own week-on-week swings (e.g. CGH, Feb 2026: ~8 h down to ~0.6 h, confirmed in
# MOH's file) are real data, not unit errors; they are only a WARN, in `validate`.

UNIT_RATIO_LIMIT = 20            # stored-vs-new median ratio beyond 20x (or 1/20x): unit error
UNIT_MIN_OVERLAP = 7             # need at least a week of overlapping cells to compare
SHEET_MEDIAN_HOURS = (0.25, 24)  # plausible median bed wait for a whole sheet, in hours

UNIT_VS_STORED = register(
    "unit.file_vs_stored", Severity.ERROR, Scope.FILE,
    f"A sheet's values agree with stored values for the same days (median ratio within {UNIT_RATIO_LIMIT}x)", tables=("moh_bed_waits",))
UNIT_PLAUSIBLE = register(
    "unit.sheet_plausible", Severity.ERROR, Scope.FILE,
    f"A sheet's median bed wait is between {SHEET_MEDIAN_HOURS[0]} and {SHEET_MEDIAN_HOURS[1]} hours", tables=("moh_bed_waits",))


@rule("moh_bed_waits")
def unit_sanity(df: pd.DataFrame, ctx: GateContext):
    out = []
    v = pd.to_numeric(df["median_wait_hours"], errors="coerce")
    sheets = df["sheet"] if "sheet" in df else pd.Series("(all)", index=df.index)
    stored = _stored_bed_waits(ctx, df)
    for sheet in sheets.dropna().unique():
        in_sheet = sheets.eq(sheet)
        med = v[in_sheet].median()
        if pd.notna(med) and not (SHEET_MEDIAN_HOURS[0] <= med <= SHEET_MEDIAN_HOURS[1]):
            out.append((UNIT_PLAUSIBLE.check_id, in_sheet,
                        f"sheet {sheet!r}: median {med:.3g} h is outside {SHEET_MEDIAN_HOURS} h; "
                        "possible minutes/hours unit error"))
        if stored is not None:
            pair = df.loc[in_sheet, ["hospital_name", "report_date"]].assign(new=v[in_sheet]).merge(
                stored, on=["hospital_name", "report_date"], how="inner")
            pair = pair[(pair.new > 0) & (pair.old > 0)]
            if len(pair) >= UNIT_MIN_OVERLAP:
                ratio = (pair.new / pair.old).median()
                if ratio > UNIT_RATIO_LIMIT or ratio < 1 / UNIT_RATIO_LIMIT:
                    out.append((UNIT_VS_STORED.check_id, in_sheet,
                                f"sheet {sheet!r}: values are {ratio:.3g}x the stored values for the same "
                                f"{len(pair)} hospital-days; possible minutes/hours unit error"))
    return out


def _stored_bed_waits(ctx: GateContext, df: pd.DataFrame):
    """Clean values already stored for the hospitals and dates in df, or None if none."""
    keys = df[["hospital_name", "report_date"]].drop_duplicates()
    con = ctx.wh.con
    con.register("_unit_keys", keys)
    try:
        stored = con.execute(
            "SELECT b.hospital_name, b.report_date, b.median_wait_hours AS old FROM moh_bed_waits b "
            "JOIN _unit_keys k ON b.hospital_name = k.hospital_name "
            "AND b.report_date = CAST(k.report_date AS DATE)").df()
    finally:
        con.unregister("_unit_keys")
    if stored.empty:
        return None
    stored["report_date"] = pd.to_datetime(stored["report_date"]).dt.date
    return stored


# --------------------------------------------------------------------------- #
# Clinics
# --------------------------------------------------------------------------- #

SG_LAT = (1.15, 1.48)            # Singapore's bounding box, including the southern islands
SG_LON = (103.6, 104.1)
CLINIC_COUNT_TOLERANCE = 0.10    # snapshot-to-snapshot change in clinic count that is unremarkable

COORDS_IN_SG = register(
    "clinic.coordinates_in_singapore", Severity.ERROR, Scope.ROW,
    f"latitude {SG_LAT[0]}-{SG_LAT[1]}, longitude {SG_LON[0]}-{SG_LON[1]}", tables=("chas_clinics",))
POSTAL_6_DIGITS = register(
    "clinic.postal_code_6_digits", Severity.WARN, Scope.ROW,
    "postal_code is exactly 6 digits", tables=("chas_clinics",))
COUNT_VS_PREVIOUS = register(
    "clinic.count_vs_previous", Severity.WARN, Scope.FILE,
    f"Clinic count within {CLINIC_COUNT_TOLERANCE:.0%} of the previous snapshot", tables=("chas_clinics",))


@rule("chas_clinics")
def clinic_location(df: pd.DataFrame, ctx: GateContext):
    lat = pd.to_numeric(df["latitude"], errors="coerce")
    lon = pd.to_numeric(df["longitude"], errors="coerce")
    inside = lat.between(*SG_LAT) & lon.between(*SG_LON)        # missing coordinates fail too
    text = "lat " + lat.astype(str) + ", lon " + lon.astype(str) + " is outside Singapore"
    postal = df["postal_code"].astype("string")
    bad_postal = ~postal.str.fullmatch(r"\d{6}").fillna(False)
    return [(COORDS_IN_SG.check_id, ~inside, text),
            (POSTAL_6_DIGITS.check_id, bad_postal, "postal_code " + postal.fillna("<missing>") + " is not 6 digits")]


@rule("chas_clinics")
def clinic_count(df: pd.DataFrame, ctx: GateContext):
    # Runs before the snapshot marks missing clinics inactive, so "active" = the previous snapshot.
    prev = ctx.wh.con.execute("SELECT count(*) FROM chas_clinics WHERE is_active").fetchall()[0][0]
    new = int(df["clinic_key"].nunique())
    if not prev:
        return []                                                    # first snapshot: nothing to compare
    change = (new - prev) / prev
    n = 1 if abs(change) > CLINIC_COUNT_TOLERANCE else 0
    return [(COUNT_VS_PREVIOUS.check_id, n,
             f"{new} clinics vs {prev} in the previous snapshot ({change:+.1%})")]
