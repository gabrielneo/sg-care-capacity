"""`sg-health validate`: dataset checks, the dq_results log and the publish-blocking exit code."""
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd
import pytest

from sg_health import cli
from sg_health.config import HOSPITALS
from sg_health.quality import validate as dq
from sg_health.warehouse import Warehouse

pytest.importorskip("duckdb")

LINEAGE = {"source_url": "https://x/f.xlsx", "source_sha256": "0" * 64, "ingested_at": datetime(2026, 11, 2)}


@pytest.fixture
def wh(tmp_path):
    w = Warehouse(tmp_path / "w.duckdb")
    yield w
    w.close()


def put_moh(wh, start: date, days: int, codes=("CGH", "SGH"), wait=lambda c, i: 4.0, attend=lambda c, i: 300):
    bw, ed = [], []
    for i in range(days):
        d = start + timedelta(days=i)
        for c in codes:
            base = {"hospital_code": c, "hospital_name": HOSPITALS[c][0], "report_date": d, **LINEAGE}
            if (w := wait(c, i)) is not None:
                bw.append({**base, "median_wait_hours": w})
            if (a := attend(c, i)) is not None:
                ed.append({**base, "total_attendances": a})
    wh.upsert("moh_bed_waits", pd.DataFrame(bw), ["hospital_name", "report_date"])
    wh.upsert("moh_ed_attendances", pd.DataFrame(ed), ["hospital_name", "report_date"])


def result(results, check_id, table):
    return next(r for r in results if r.check.check_id == check_id and r.table == table)


def only_codes(monkeypatch, *codes):
    """Limit the reference list so completeness doesn't expect all 9 hospitals in small fixtures."""
    from sg_health.config import HOSPITAL_REFERENCE
    monkeypatch.setattr(dq, "HOSPITAL_REFERENCE", {c: HOSPITAL_REFERENCE[c] for c in codes})


# ------------------------------------------------------------------- freshness #

@pytest.mark.parametrize("age, warn, error", [(14, "pass", "pass"), (15, "fail", "pass"), (29, "fail", "fail")])
def test_freshness_thresholds(wh, age, warn, error):
    put_moh(wh, date(2026, 10, 4), 28)                                  # latest 2026-10-31
    results = dq.run_validation(wh, today=date(2026, 10, 31) + timedelta(days=age))
    assert result(results, "freshness.moh_14_days", "moh_bed_waits").status == warn
    fresh_error = result(results, "freshness.moh_28_days", "moh_bed_waits")
    assert fresh_error.status == error and fresh_error.blocking == (error == "fail")


# ---------------------------------------------------------------- completeness #

def test_completeness_lists_the_missing_days_by_week(wh, monkeypatch):
    only_codes(monkeypatch, "CGH", "SGH")
    put_moh(wh, date(2026, 10, 4), 28, wait=lambda c, i: None if (c == "SGH" and i in (10, 11)) else 4.0)
    r = result(dq.run_validation(wh, today=date(2026, 11, 2)), "completeness.moh_week_7_days", "moh_bed_waits")
    assert (r.status, r.failing_rows) == ("fail", 2)
    assert r.details == "SGH week of 2026-10-11: 2 of 7 days missing"
    assert not r.blocking                                               # WARN: published, shown


def test_completeness_does_not_expect_a_hospital_before_it_opened(wh, monkeypatch):
    only_codes(monkeypatch, "CGH", "WH")                               # WH reported from 2024-06-23
    put_moh(wh, date(2024, 6, 2), 21, codes=("CGH",))
    put_moh(wh, date(2024, 6, 23), 14, codes=("CGH", "WH"))
    r = result(dq.run_validation(wh, today=date(2024, 7, 8)), "completeness.moh_week_7_days", "moh_bed_waits")
    assert r.status == "pass"


# -------------------------------------------------------- rolling attendances #

def test_attendance_outlier_against_its_own_8_week_history(wh):
    rng = np.random.default_rng(0)
    noise = rng.normal(0, 10, 70).round()
    put_moh(wh, date(2026, 8, 1), 70, codes=("CGH",), attend=lambda c, i: 900 if i == 65 else int(300 + noise[i]))
    r = result(dq.run_validation(wh, today=date(2026, 10, 10)), "range.attendances_rolling_4sd", "moh_ed_attendances")
    assert (r.status, r.failing_rows) == ("fail", 1) and "CGH 2026-10-05: 900" in r.details


# ------------------------------------------------------------- weekly shift #

def test_weekly_shift_is_a_warning_not_a_block(wh):
    put_moh(wh, date(2026, 1, 4), 42, codes=("CGH",), wait=lambda c, i: 0.5 if i >= 35 else 8.0)
    results = dq.run_validation(wh, today=date(2026, 2, 16))
    r = result(results, "unit.weekly_shift_10x", "moh_bed_waits")
    assert r.status == "fail" and r.check.severity.value == "WARN" and not r.blocking


# --------------------------------------------------------- the command itself #

def run_validate(paths):
    return cli.main(["--db", str(paths["db"]), "--raw-dir", str(paths["raw"]),
                     "--report", str(paths["report"]), "validate"])


def test_validate_exits_0_when_only_rows_were_quarantined(paths, capsys, monkeypatch):
    monkeypatch.setattr("sg_health.config.now_sgt", lambda: datetime(2026, 11, 2, 9))
    wh = Warehouse(paths["db"])
    put_moh(wh, date(2026, 10, 4), 28)
    wh.con.execute("INSERT INTO dq_findings VALUES ('chas_clinics', 'clinic.coordinates_in_singapore', "
                   "'ERROR', 'row', '{\"clinic_key\": \"C2\"}', 1, 'outside', 'u', 's')")
    wh.close()
    assert run_validate(paths) == 0
    out = capsys.readouterr().out
    assert "FAIL (quarantined)" in out and "OK to publish" in out


def test_validate_exits_1_and_says_so_when_a_check_blocks(paths, capsys, monkeypatch):
    monkeypatch.setattr("sg_health.config.now_sgt", lambda: datetime(2026, 12, 15, 9))   # 45 days stale
    wh = Warehouse(paths["db"])
    put_moh(wh, date(2026, 10, 4), 28)
    wh.close()
    assert run_validate(paths) == 1
    out = capsys.readouterr().out
    assert "FAIL (blocks)" in out and "freshness.moh_28_days" in out and "PUBLISH BLOCKED" in out


def test_every_run_is_logged_in_dq_results(paths, monkeypatch):
    monkeypatch.setattr("sg_health.config.now_sgt", lambda: datetime(2026, 11, 2, 9))
    wh = Warehouse(paths["db"])
    put_moh(wh, date(2026, 10, 4), 28)
    wh.close()
    run_validate(paths)
    run_validate(paths)
    wh = Warehouse(paths["db"])
    log = wh.query('SELECT run_id, check_id, "table", severity, status, failing_rows, details, checked_at, '
                   "scope, blocks_publish FROM dq_results")
    wh.close()
    assert log["run_id"].nunique() == 2
    per_run = log.groupby("run_id").size()
    assert (per_run == per_run.iloc[0]).all() and per_run.iloc[0] >= 40     # every check, every run
    assert set(log["status"]) <= {"pass", "fail", "skipped"}
