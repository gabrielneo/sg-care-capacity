"""Table rules, fed through the real parser and loader with deliberately bad source files.

Each test asserts that the specific check fails, the bad rows are quarantined (ERROR) or
flagged but published (WARN), and the good rows in the same file are untouched.
"""
from datetime import date, datetime, time

import pandas as pd
import pytest

from sg_health.load import Loader
from sg_health.raw import RawStore
from sg_health.warehouse import Warehouse

from conftest import XLSX, make_xlsx

pytest.importorskip("duckdb")

FETCHED = datetime(2026, 11, 2, 8, 0)          # a Monday: the week 25-31 Oct is complete


@pytest.fixture
def env(tmp_path):
    wh = Warehouse(tmp_path / "w.duckdb")
    store = RawStore(tmp_path / "raw")
    yield wh, store, Loader(wh, store)
    wh.close()


def load(env, source, content, fetched_at=FETCHED, url=None):
    wh, store, loader = env
    rec = store.save(source, url or f"https://www.moh.gov.sg/files/{source}-{fetched_at:%Y%m%d}.xlsx",
                     content, http_status=200, content_type=XLSX, fetched_at=fetched_at)
    return loader.process(rec)


def bed_waits_xlsx(rows, header=("Date", "CGH", "SGH"), title="Waiting Times (50th Percentile) for Admission from ED"):
    return make_xlsx([[title], [None], list(header), *rows])


def table(env, sql):
    return env[0].query(sql)


def findings(env, check_id):
    return table(env, f"SELECT * FROM dq_findings WHERE check_id = '{check_id}'")


def test_future_report_date_is_quarantined(env):
    content = bed_waits_xlsx([[datetime(2026, 10, 31), 5.0, 3.0],
                              [datetime(2026, 11, 3), 4.0, 2.0]])     # day after the fetch
    load(env, "moh_bed_waits", content)
    clean = table(env, "SELECT report_date FROM moh_bed_waits ORDER BY 1")
    assert [d.date() if hasattr(d, "date") else d for d in clean["report_date"]] == [date(2026, 10, 31)] * 2
    q = table(env, "SELECT check_ids, report_date FROM quarantine_moh_bed_waits ORDER BY report_date")
    assert set(q["check_ids"]) == {"domain.report_date_not_future"} and len(q) == 2
    assert len(findings(env, "domain.report_date_not_future")) == 2


def test_unknown_hospital_column_is_reported_not_dropped_silently(env):
    content = bed_waits_xlsx([[datetime(2026, 10, 25), 5.0, 3.0, 4.0],
                              [datetime(2026, 10, 26), 5.5, 3.5, 4.5]], header=("Date", "CGH", "SGH", "NEWH"))
    load(env, "moh_bed_waits", content)
    f = findings(env, "domain.unrecognised_hospital_column")
    assert len(f) == 1 and "NEWH" in f["detail"][0] and f["severity"][0] == "WARN"
    assert len(table(env, "SELECT * FROM moh_bed_waits")) == 4       # known hospitals still load


def test_unknown_hospital_code_is_quarantined(env, monkeypatch):
    from sg_health import config
    monkeypatch.setitem(config.HOSPITALS, "XYZ", ("Imaginary Hospital", r"\bxyz\b"))   # parser knows it ...
    content = bed_waits_xlsx([[datetime(2026, 10, 25), 5.0, 1.0], [datetime(2026, 10, 26), 5.0, 1.0]],
                             header=("Date", "CGH", "XYZ"))
    load(env, "moh_bed_waits", content)                               # ... the reference list does not
    assert set(table(env, "SELECT hospital_code FROM moh_bed_waits")["hospital_code"]) == {"CGH"}
    assert len(findings(env, "domain.hospital_code")) == 2


def test_impossible_bed_wait_is_quarantined_and_over_24h_is_published_with_a_warning(env):
    content = bed_waits_xlsx([[datetime(2026, 10, 25), 80.0, 3.0],    # > 72 h: impossible
                              [datetime(2026, 10, 26), 30.0, 3.0],    # > 24 h: exceptional
                              [datetime(2026, 10, 27), 5.0, 3.0]],
                             title="Waiting Times (50th Percentile) for Admission from ED (hours)")
    load(env, "moh_bed_waits", content)
    clean = table(env, "SELECT median_wait_hours FROM moh_bed_waits WHERE hospital_code = 'CGH' ORDER BY report_date")
    assert list(clean["median_wait_hours"]) == [30.0, 5.0]           # the 30 h day is published
    assert list(table(env, "SELECT median_wait_hours FROM quarantine_moh_bed_waits")["median_wait_hours"]) == ["80.0"]
    assert len(findings(env, "range.bed_wait_bounds")) == 1
    warn = findings(env, "range.bed_wait_over_24h")
    assert len(warn) == 1 and warn["severity"][0] == "WARN"


def test_negative_attendance_is_quarantined(env):
    content = make_xlsx([["Daily ED Attendances by Hospital"], [None], ["Date", "CGH", "SGH"],
                         [datetime(2026, 10, 25), 400, -5], [datetime(2026, 10, 26), 380, 300]])
    load(env, "moh_ed_attendances", content)
    assert len(table(env, "SELECT * FROM moh_ed_attendances")) == 3
    assert len(findings(env, "range.attendances_negative")) == 1
