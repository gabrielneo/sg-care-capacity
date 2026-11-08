"""`sg-health validate`: report every check, run the dataset-level ones, log to dq_results.

Row- and file-level checks already ran in the load gate; their current results are in
dq_findings, so validate reads them back rather than re-running them. Dataset checks look
across whole clean tables and run here. Nothing in this module changes a clean table.
"""
from __future__ import annotations

import calendar
import json
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date

import pandas as pd

from .. import config
from ..config import HOSPITAL_REFERENCE, HOSPITALS
from ..warehouse import Warehouse
from . import rules  # noqa: F401  (registers the gate checks so they are all reported)
from .model import CHECKS, Check, Scope, Severity, register

MOH_TABLES = ("moh_bed_waits", "moh_ed_attendances")
MOH_SERIES_START = date(2023, 1, 1)
FRESH_WARN_DAYS, FRESH_ERROR_DAYS = 14, 28
ROLLING_DAYS, ROLLING_SD = 56, 4          # 8 weeks of prior days; flag beyond 4 standard deviations
SHIFT_RATIO, SHIFT_TRAILING_WEEKS = 10, 4
DETAIL_SAMPLES = 10                       # examples listed in details; failing_rows has the full count

COMPLETENESS = register(
    "completeness.moh_week_7_days", Severity.WARN, Scope.DATASET,
    "Each expected hospital has 7 daily values in every MOH week (Sun-Sat)", MOH_TABLES)
FRESH_WARN = register(
    "freshness.moh_14_days", Severity.WARN, Scope.DATASET,
    f"Latest report_date is at most {FRESH_WARN_DAYS} days old", MOH_TABLES)
FRESH_ERROR = register(
    "freshness.moh_28_days", Severity.ERROR, Scope.DATASET,
    f"Latest report_date is at most {FRESH_ERROR_DAYS} days old", MOH_TABLES)
ROLLING = register(
    "range.attendances_rolling_4sd", Severity.WARN, Scope.DATASET,
    f"Daily attendances within the prior {ROLLING_DAYS}-day mean +/- {ROLLING_SD} SD, per hospital",
    ("moh_ed_attendances",))
SHIFT = register(
    "unit.weekly_shift_10x", Severity.WARN, Scope.DATASET,
    f"A hospital's weekly median bed wait within {SHIFT_RATIO}x of its trailing "
    f"{SHIFT_TRAILING_WEEKS}-week median", ("moh_bed_waits",))


@dataclass
class Result:
    check: Check
    table: str
    status: str                   # "pass" | "fail" | "skipped"
    failing_rows: int = 0
    details: str = ""

    @property
    def blocking(self) -> bool:
        return self.status == "fail" and self.check.blocks_publish


DatasetCheck = Callable[[Warehouse, date], list[Result]]
DATASET_CHECKS: list[DatasetCheck] = []


def dataset_check(fn: DatasetCheck) -> DatasetCheck:
    DATASET_CHECKS.append(fn)
    return fn


def week_start(d: pd.Series) -> pd.Series:
    """Sunday on or before each date (MOH weeks run Sunday to Saturday)."""
    d = pd.to_datetime(d)
    return (d - pd.to_timedelta((d.dt.day_of_week + 1) % 7, unit="D")).dt.date


def _moh(wh: Warehouse, table: str) -> pd.DataFrame:
    df = wh.query(f"SELECT * FROM {table}")
    if len(df):
        df["report_date"] = pd.to_datetime(df["report_date"]).dt.date
    return df


# --------------------------------------------------------------------------- #
# Dataset checks
# --------------------------------------------------------------------------- #

@dataset_check
def completeness(wh: Warehouse, today: date) -> list[Result]:
    out = []
    for table in MOH_TABLES:
        df = _moh(wh, table)
        if df.empty:
            out.append(Result(COMPLETENESS, table, "skipped", details="no rows"))
            continue
        first, last = df["report_date"].min(), df["report_date"].max()
        gaps: list[str] = []
        missing_days = 0
        for code, (_, valid_from) in HOSPITAL_REFERENCE.items():
            name = HOSPITALS[code][0]
            start = max(first, valid_from or MOH_SERIES_START)
            expected = pd.date_range(start, last, freq="D").date
            have = set(df.loc[df["hospital_name"] == name, "report_date"])
            missing = sorted(set(expected) - have)
            missing_days += len(missing)
            if missing:
                per_week = pd.Series(week_start(pd.Series(missing))).value_counts().sort_index()
                gaps += [f"{code} week of {wk}: {n} of 7 days missing" for wk, n in per_week.items()]
        out.append(Result(COMPLETENESS, table, "fail" if missing_days else "pass", missing_days,
                          "; ".join(gaps[:DETAIL_SAMPLES]) + (f"; ... {len(gaps)} weeks in all" if len(gaps) > DETAIL_SAMPLES else "")))
    return out


@dataset_check
def freshness(wh: Warehouse, today: date) -> list[Result]:
    out = []
    for table in MOH_TABLES:
        latest = wh.con.execute(f"SELECT max(report_date) FROM {table}").fetchall()[0][0]
        if latest is None:
            out += [Result(c, table, "skipped", details="no rows") for c in (FRESH_WARN, FRESH_ERROR)]
            continue
        age = (today - latest).days
        text = f"latest report_date {latest} is {age} days old (checked {today})"
        out.append(Result(FRESH_WARN, table, "fail" if age > FRESH_WARN_DAYS else "pass", 0, text))
        out.append(Result(FRESH_ERROR, table, "fail" if age > FRESH_ERROR_DAYS else "pass", 0, text))
    return out


POP_FRESH_MONTHS = 15
FRESH_POPULATION = register(
    "freshness.population_15_months", Severity.WARN, Scope.DATASET,
    f"Latest SingStat reference date (end-June) is at most {POP_FRESH_MONTHS} months old",
    ("pop_65plus_by_area",))


@dataset_check
def population_freshness(wh: Warehouse, today: date) -> list[Result]:
    latest = wh.con.execute("SELECT max(year) FROM pop_65plus_by_area").fetchall()[0][0]
    if latest is None:
        return [Result(FRESH_POPULATION, "pop_65plus_by_area", "skipped", details="no rows")]
    ref = date(int(latest), 6, 30)
    y, m = divmod(ref.month - 1 + POP_FRESH_MONTHS, 12)
    year, month = ref.year + y, m + 1
    cutoff = date(year, month, min(ref.day, calendar.monthrange(year, month)[1]))   # 30 Jun + 15 months = 30 Sep
    text = (f"latest reference date {ref}; stale after {cutoff} (checked {today}). SingStat publishes each June "
            f"edition around September: update config.SINGSTAT_RESIDENTS_URL")
    return [Result(FRESH_POPULATION, "pop_65plus_by_area", "fail" if today > cutoff else "pass", 0, text)]


POPULATION_PRESENT = register(
    "completeness.population_present", Severity.ERROR, Scope.DATASET,
    "Every planning area in the boundary file has a resident population for the latest year",
    ("pop_65plus_by_area",))


@dataset_check
def population_present(wh: Warehouse, today: date) -> list[Result]:
    areas = wh.con.execute("SELECT count(*) FROM planning_area_boundaries").fetchall()[0][0]
    if not areas:
        return [Result(POPULATION_PRESENT, "pop_65plus_by_area", "skipped", details="no planning-area boundaries")]
    missing = [r[0] for r in wh.con.execute("""
        SELECT b.planning_area_name FROM planning_area_boundaries b
        WHERE upper(b.planning_area_name) NOT IN (
            SELECT upper(planning_area) FROM pop_65plus_by_area
            WHERE year = (SELECT max(year) FROM pop_65plus_by_area))
        ORDER BY 1""").fetchall()]
    if not missing:
        return [Result(POPULATION_PRESENT, "pop_65plus_by_area", "pass", 0, f"{areas} of {areas} planning areas")]
    detail = ("no SingStat population loaded" if len(missing) == areas
              else f"{len(missing)} of {areas} planning areas lack a population (renamed or new?): {missing[:DETAIL_SAMPLES]}")
    return [Result(POPULATION_PRESENT, "pop_65plus_by_area", "fail", len(missing), detail)]


POP_SUBZONES_ADD_UP = register(
    "population.area_equals_sum_of_subzones", Severity.ERROR, Scope.DATASET,
    "Each planning area's residents (all, and 65+) equal the sum of its subzones, every year",
    ("pop_65plus_by_area",))


@dataset_check
def population_subzones_add_up(wh: Warehouse, today: date) -> list[Result]:
    areas = wh.con.execute("SELECT count(*) FROM pop_65plus_by_area").fetchall()[0][0]
    subzones = wh.con.execute("SELECT count(*) FROM pop_65plus_by_subzone").fetchall()[0][0]
    if not areas and not subzones:
        return [Result(POP_SUBZONES_ADD_UP, "pop_65plus_by_area", "skipped", details="no rows")]
    # A full join, so an area with no subzones (or subzones with no area) is a mismatch too.
    off = wh.con.execute("""
        WITH sz AS (SELECT planning_area, year, sum(residents_total)::BIGINT AS total,
                           sum(residents_65plus)::BIGINT AS aged, count(*) AS n
                    FROM pop_65plus_by_subzone GROUP BY ALL)
        SELECT coalesce(a.planning_area, sz.planning_area), coalesce(a.year, sz.year),
               a.residents_total, sz.total, a.residents_65plus, sz.aged
        FROM pop_65plus_by_area a FULL JOIN sz USING (planning_area, year)
        WHERE a.residents_total IS DISTINCT FROM sz.total OR a.residents_65plus IS DISTINCT FROM sz.aged
        ORDER BY 2, 1""").fetchall()
    if not off:
        return [Result(POP_SUBZONES_ADD_UP, "pop_65plus_by_area", "pass", 0,
                       f"{areas} planning-area rows equal the sum of {subzones} subzone rows")]
    detail = "; ".join(f"{pa} {yr}: area {t}/{a} (all/65+) vs subzones {st}/{sa}"
                       for pa, yr, t, st, a, sa in off[:DETAIL_SAMPLES])
    return [Result(POP_SUBZONES_ADD_UP, "pop_65plus_by_area", "fail", len(off),
                   detail + (f"; ... {len(off)} in all" if len(off) > DETAIL_SAMPLES else ""))]


@dataset_check
def rolling_attendances(wh: Warehouse, today: date) -> list[Result]:
    df = _moh(wh, "moh_ed_attendances")
    if df.empty:
        return [Result(ROLLING, "moh_ed_attendances", "skipped", details="no rows")]
    df = df.sort_values(["hospital_code", "report_date"])
    prior = df.groupby("hospital_code")["total_attendances"].transform
    df["mean"] = prior(lambda s: s.shift(1).rolling(ROLLING_DAYS, min_periods=ROLLING_DAYS).mean())
    df["sd"] = prior(lambda s: s.shift(1).rolling(ROLLING_DAYS, min_periods=ROLLING_DAYS).std())
    flagged = df[(df["sd"] > 0) & ((df["total_attendances"] - df["mean"]).abs() > ROLLING_SD * df["sd"])]
    samples = [f"{r.hospital_code} {r.report_date}: {int(r.total_attendances)} vs mean {r.mean:.0f} (SD {r.sd:.0f})"
               for r in flagged.itertuples()]
    return [Result(ROLLING, "moh_ed_attendances", "fail" if len(flagged) else "pass", len(flagged),
                   "; ".join(samples[:DETAIL_SAMPLES]))]


@dataset_check
def weekly_shift(wh: Warehouse, today: date) -> list[Result]:
    df = _moh(wh, "moh_bed_waits")
    if df.empty:
        return [Result(SHIFT, "moh_bed_waits", "skipped", details="no rows")]
    df["week"] = week_start(df["report_date"])
    wk = df.groupby(["hospital_code", "week"])["median_wait_hours"].median().reset_index()
    wk["trailing"] = wk.groupby("hospital_code")["median_wait_hours"].transform(
        lambda s: s.shift(1).rolling(SHIFT_TRAILING_WEEKS, min_periods=SHIFT_TRAILING_WEEKS).median())
    ratio = wk["median_wait_hours"] / wk["trailing"]
    flagged = wk[(ratio > SHIFT_RATIO) | (ratio < 1 / SHIFT_RATIO)]
    samples = [f"{r.hospital_code} week of {r.week}: {r.median_wait_hours:.2f} h vs trailing {r.trailing:.2f} h"
               for r in flagged.itertuples()]
    return [Result(SHIFT, "moh_bed_waits", "fail" if len(flagged) else "pass", len(flagged),
                   "; ".join(samples[:DETAIL_SAMPLES]))]


# --------------------------------------------------------------------------- #
# Reconciliation (WARN only)
# --------------------------------------------------------------------------- #

RECONCILE_TOLERANCE = 0.25        # annualised MOH daily vs annual series
RECONCILE_MIN_DAYS = 180          # don't annualise a year from less than half a year of days

RECONCILE_ANNUAL = register(
    "reconcile.annual_ae", Severity.WARN, Scope.DATASET,
    f"Annualised MOH daily ED attendances within {RECONCILE_TOLERANCE:.0%} of the annual A&E series",
    ("moh_ed_attendances",))
RECONCILE_NUHS = register(
    "reconcile.nuhs_vs_moh_nuh", Severity.WARN, Scope.DATASET,
    "NUHS live bed-wait estimate vs MOH's NUH (adult) median for the same day: direction and gap, "
    "reported only", ("nuhs_live_waits",))


@dataset_check
def reconcile_annual(wh: Warehouse, today: date) -> list[Result]:
    daily = wh.query("""
        SELECT year(report_date) AS year, count(DISTINCT report_date) AS days, sum(total_attendances) AS total
        FROM moh_ed_attendances GROUP BY 1""")
    annual = wh.query("SELECT year, attendances FROM annual_ae_attendances WHERE attendances IS NOT NULL")
    both = daily.merge(annual, on="year")
    both = both[both["days"] >= RECONCILE_MIN_DAYS]
    if both.empty:
        return [Result(RECONCILE_ANNUAL, "moh_ed_attendances", "skipped", details="no overlapping years "
                       f"with at least {RECONCILE_MIN_DAYS} days of MOH daily data")]
    lines, off = [], 0
    for r in both.sort_values("year").itertuples():
        days_in_year = 366 if calendar.isleap(int(r.year)) else 365
        annualised = r.total * days_in_year / r.days
        gap = (annualised - r.attendances) / r.attendances
        off += abs(gap) > RECONCILE_TOLERANCE
        lines.append(f"{int(r.year)}: MOH daily {annualised:,.0f} ({int(r.days)} days) vs annual "
                     f"{int(r.attendances):,} ({gap:+.1%})")
    return [Result(RECONCILE_ANNUAL, "moh_ed_attendances", "fail" if off else "pass", int(off), "; ".join(lines))]


@dataset_check
def reconcile_nuhs(wh: Warehouse, today: date) -> list[Result]:
    pairs = wh.query("""
        SELECT CAST(n.snapshot_timestamp AS DATE) AS day, n.snapshot_timestamp, n.est_bed_wait_hours AS live,
               b.median_wait_hours AS moh
        FROM nuhs_live_waits n
        JOIN moh_bed_waits b ON b.hospital_code = 'NUH' AND b.report_date = CAST(n.snapshot_timestamp AS DATE)
        WHERE n.site_name ILIKE '%National University Hospital%' AND n.department ILIKE '%adult%'
          AND n.est_bed_wait_hours IS NOT NULL
          AND n.est_bed_wait_qualifier IS NULL                -- a bound ("< 1 hour") is not a value to compare
        ORDER BY n.snapshot_timestamp""")
    if pairs.empty:
        n_live = wh.con.execute("SELECT count(*) FROM nuhs_live_waits").fetchall()[0][0]
        return [Result(RECONCILE_NUHS, "nuhs_live_waits", "skipped",
                       details="no NUHS adult snapshot falls on a day MOH has published yet"
                       if n_live else "no rows")]
    lines = [f"{r.snapshot_timestamp:%Y-%m-%d %H:%M}: live {r.live:.1f} h vs MOH median {r.moh:.1f} h "
             f"({'above' if r.live > r.moh else 'below' if r.live < r.moh else 'equal'}, {r.live - r.moh:+.1f} h)"
             for r in pairs.itertuples()]
    # Informational: a point-in-time estimate and a daily median of admitted patients measure
    # different things, so a gap is expected and never fails the check.
    return [Result(RECONCILE_NUHS, "nuhs_live_waits", "pass", 0, "; ".join(lines[:DETAIL_SAMPLES]))]


# --------------------------------------------------------------------------- #
# Gate results, read back from dq_findings
# --------------------------------------------------------------------------- #

def gate_results(wh: Warehouse) -> list[Result]:
    f = wh.query("SELECT * FROM dq_findings")
    out = []
    for check in CHECKS.values():
        if check.scope is Scope.DATASET:
            continue
        for table in check.tables:
            mine = f[(f["check_id"] == check.check_id) & (f["table_name"] == table)]
            if len(mine):
                samples = [json.loads(k) if isinstance(k, str) else {}     # file-level: no row key
                           for k in mine["row_key"].head(DETAIL_SAMPLES)]
                text = "; ".join(f"{_short(k)}: {d}" if k else d for k, d in zip(samples, mine["detail"]))
                out.append(Result(check, table, "fail", int(mine["failing_rows"].sum()), text))
                continue
            seen = wh.con.execute(f"SELECT (SELECT count(*) FROM {table}) + "
                                  f"(SELECT count(*) FROM quarantine_{table})").fetchall()[0][0]
            out.append(Result(check, table, "pass" if seen else "skipped", 0, "" if seen else "no rows"))
    return out


def _short(key: dict) -> str:
    return ", ".join(str(v) for v in key.values())


# --------------------------------------------------------------------------- #
# Run, record, report
# --------------------------------------------------------------------------- #

def run_validation(wh: Warehouse, today: date | None = None) -> list[Result]:
    today = today or config.now_sgt().date()
    results = gate_results(wh)
    for fn in DATASET_CHECKS:
        results.extend(fn(wh, today))
    return sorted(results, key=_order)


def _order(r: Result):
    return ({"fail": 0, "pass": 1, "skipped": 2}[r.status], r.check.severity is not Severity.ERROR,
            r.check.check_id, r.table)


def record(wh: Warehouse, results: list[Result]) -> str:
    """Append this run to dq_results. Returns the run_id."""
    checked_at = config.now_sgt()
    run_id = f"{checked_at:%Y%m%dT%H%M%S}-{uuid.uuid4().hex[:6]}"
    df = pd.DataFrame([{
        "check_id": r.check.check_id, "table": r.table, "severity": r.check.severity.value,
        "status": r.status, "failing_rows": r.failing_rows, "details": r.details, "run_id": run_id,
        "checked_at": checked_at, "scope": r.check.scope.value, "blocks_publish": r.check.blocks_publish}
        for r in results])
    wh.upsert("dq_results", df, ["run_id", "check_id", "table"])
    return run_id


def summary_markdown(results: list[Result], run_id: str) -> str:
    """Failing checks as Markdown, for the GitHub issue opened when publishing is blocked."""
    failing = [r for r in results if r.status == "fail"]
    blocking = [r for r in failing if r.blocking]
    lines = [f"**Validation run `{run_id}`: {len(blocking)} check(s) block publishing, "
             f"{len(failing)} failing in total.** No snapshot was published; the site keeps the last good one.", "",
             "| Blocks | Severity | Check | Table | Rows | Details |", "|---|---|---|---|---|---|"]
    for r in sorted(failing, key=lambda r: (not r.blocking, r.check.check_id)):
        detail = r.details.replace("|", "\\|").replace("\n", " ")[:200]
        lines.append(f"| {'**yes**' if r.blocking else 'no'} | {r.check.severity.value} | `{r.check.check_id}` | "
                     f"`{r.table}` | {r.failing_rows} | {detail} |")
    lines += ["", "What each check means and how to fix a failure: `docs/data_quality.md`; release process: "
              "`docs/runbook.md`."]
    return "\n".join(lines) + "\n"


def summary_table(results: list[Result], run_id: str) -> str:
    """Plain-text summary for the terminal and CI logs."""
    def status(r: Result) -> str:
        if r.status != "fail":
            return r.status.upper()
        if r.check.severity is Severity.WARN:
            return "WARN"
        return "FAIL (blocks)" if r.check.blocks_publish else "FAIL (quarantined)"
    rows = [(status(r), r.check.severity.value, r.check.check_id, r.table, str(r.failing_rows),
             (r.details[:90] + "...") if len(r.details) > 93 else r.details) for r in results]
    head = ("STATUS", "SEVERITY", "CHECK", "TABLE", "ROWS", "DETAILS")
    widths = [max(len(x[i]) for x in [head, *rows]) for i in range(5)]
    fmt = lambda x: "  ".join(c.ljust(w) for c, w in zip(x[:5], widths)) + "  " + x[5]
    lines = [fmt(head), fmt(tuple("-" * w for w in widths) + ("-" * 7,))] + [fmt(x) for x in rows]
    blocking = [r for r in results if r.blocking]
    fails = sum(r.status == "fail" for r in results)
    lines += ["", f"run {run_id}: {len(results)} checks, {fails} failing, {len(blocking)} blocking publish"
              + (" -> PUBLISH BLOCKED" if blocking else " -> OK to publish")]
    return "\n".join(lines)
