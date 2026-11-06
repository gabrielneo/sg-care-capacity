"""`sg-health validate`: report every check, run the dataset-level ones, log to dq_results.

Row- and file-level checks already ran in the load gate; their current results are in
dq_findings, so validate reads them back rather than re-running them. Dataset checks look
across whole clean tables and run here. Nothing in this module changes a clean table.
"""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import date
from typing import Callable

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
