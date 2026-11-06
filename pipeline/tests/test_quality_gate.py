"""The load gate: generic schema checks, quarantine and findings (no table-specific rules)."""
from datetime import date, datetime

import pandas as pd
import pytest

from sg_health.logs import ParseStats
from sg_health.quality.gate import GateContext, gate
from sg_health.raw import RawRecord
from sg_health.warehouse import Warehouse

pytest.importorskip("duckdb")

REC = RawRecord(seq=0, source="moh_bed_waits", url="https://x/wk43.xlsx", sha256="a" * 64, bytes=1,
                http_status=200, content_type=None, fetched_at=datetime(2026, 11, 2, 8, 0), path="p")
KEYS = ["hospital_name", "report_date"]


def rows(*values, **overrides):
    """Bed-wait rows: values are (hospital_name, report_date, median_wait_hours)."""
    df = pd.DataFrame(values, columns=["hospital_name", "report_date", "median_wait_hours"])
    df["hospital_code"] = df["hospital_name"].str[:3].str.upper()
    for k, v in {"source_url": REC.url, "source_sha256": REC.sha256, "ingested_at": REC.fetched_at,
                 **overrides}.items():
        df[k] = v
    return df


@pytest.fixture
def wh(tmp_path):
    w = Warehouse(tmp_path / "w.duckdb")
    yield w
    w.close()


def run_gate(wh, df, rec=REC, table="moh_bed_waits"):
    stats = ParseStats()
    clean = gate(df, GateContext(wh, table, KEYS, rec, stats))
    return clean, stats


def findings(wh):
    return wh.query("SELECT check_id, severity, scope, row_key, failing_rows FROM dq_findings ORDER BY check_id")


def test_good_rows_pass_through_unchanged(wh):
    df = rows(("Changi General Hospital", date(2026, 10, 25), 5.0), ("Singapore General Hospital", date(2026, 10, 25), 3.0))
    clean, stats = run_gate(wh, df)
    pd.testing.assert_frame_equal(clean.reset_index(drop=True), df)    # values untouched
    assert findings(wh).empty and wh.query("SELECT * FROM quarantine_moh_bed_waits").empty


def test_conflicting_duplicate_key_quarantines_every_copy(wh):
    df = rows(("Changi General Hospital", date(2026, 10, 25), 5.0),
              ("Changi General Hospital", date(2026, 10, 25), 9.0),     # same key, different value
              ("Singapore General Hospital", date(2026, 10, 25), 3.0))
    clean, stats = run_gate(wh, df)
    assert list(clean["hospital_name"]) == ["Singapore General Hospital"]
    q = wh.query("SELECT check_ids, median_wait_hours FROM quarantine_moh_bed_waits ORDER BY median_wait_hours")
    assert q.to_dict("records") == [{"check_ids": "schema.duplicate_key", "median_wait_hours": "5.0"},
                                    {"check_ids": "schema.duplicate_key", "median_wait_hours": "9.0"}]
    assert stats.drop_reasons == {"quarantined": 2}


def test_identical_duplicate_is_merged_not_quarantined(wh):
    df = rows(("Changi General Hospital", date(2026, 10, 25), 5.0), ("Changi General Hospital", date(2026, 10, 25), 5.0))
    clean, stats = run_gate(wh, df)
    assert len(clean) == 1 and stats.drop_reasons == {"duplicate_key": 1}
    assert findings(wh).empty


def test_value_of_wrong_type_is_quarantined(wh):
    df = rows(("Changi General Hospital", date(2026, 10, 25), 5.0), ("Singapore General Hospital", date(2026, 10, 25), "n/a"))
    clean, _ = run_gate(wh, df)
    assert list(clean["hospital_name"]) == ["Changi General Hospital"]
    f = findings(wh)
    assert list(f["check_id"]) == ["schema.types"] and '"Singapore General Hospital"' in f["row_key"][0]


def test_missing_required_value_is_quarantined(wh):
    df = rows(("Changi General Hospital", None, 5.0), ("Singapore General Hospital", date(2026, 10, 25), 3.0))
    clean, _ = run_gate(wh, df)
    assert list(clean["hospital_name"]) == ["Singapore General Hospital"]
    assert list(findings(wh)["check_id"]) == ["schema.required_values"]


def test_missing_required_column_quarantines_the_whole_file(wh):
    df = rows(("Changi General Hospital", date(2026, 10, 25), 5.0)).drop(columns=["report_date"])
    clean, stats = run_gate(wh, df)
    assert clean.empty and stats.drop_reasons == {"quarantined": 1}
    f = findings(wh)
    assert f.to_dict("records")[0] | {"row_key": None} == {
        "check_id": "schema.required_columns", "severity": "ERROR", "scope": "file", "row_key": None, "failing_rows": 1}


def test_later_good_value_clears_the_old_quarantine_row(wh):
    bad = rows(("Changi General Hospital", date(2026, 10, 25), "n/a"))
    run_gate(wh, bad)
    assert len(wh.query("SELECT * FROM quarantine_moh_bed_waits")) == 1
    rec2 = RawRecord(**{**REC.__dict__, "seq": 1, "sha256": "b" * 64, "fetched_at": datetime(2026, 11, 9, 8, 0)})
    good = rows(("Changi General Hospital", date(2026, 10, 25), 5.0), source_sha256=rec2.sha256)
    clean, _ = run_gate(wh, good, rec=rec2)
    assert len(clean) == 1
    assert wh.query("SELECT * FROM quarantine_moh_bed_waits").empty and findings(wh).empty
