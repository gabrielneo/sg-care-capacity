"""Table rules, fed through the real parser and loader with deliberately bad source files.

Each test asserts that the specific check fails, the bad rows are quarantined (ERROR) or
flagged but published (WARN), and the good rows in the same file are untouched.
"""
from datetime import date, datetime

import pandas as pd
import pytest
from conftest import XLSX, make_xlsx

from sg_health.load import Loader
from sg_health.raw import RawStore
from sg_health.warehouse import Warehouse

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


def test_a_median_wait_of_zero_is_published_as_is_with_a_warning(env):
    # Woodlands published 0 on 22 and 29 Dec 2025: kept, never changed, but flagged (audit I-2).
    content = bed_waits_xlsx([[datetime(2026, 10, 25), 0.0, 3.0], [datetime(2026, 10, 26), 5.0, 3.0]],
                             title="Waiting Times (50th Percentile) for Admission from ED (hours)")
    load(env, "moh_bed_waits", content)
    clean = table(env, "SELECT median_wait_hours FROM moh_bed_waits WHERE hospital_code = 'CGH' ORDER BY report_date")
    assert list(clean["median_wait_hours"]) == [0.0, 5.0]
    warn = findings(env, "range.bed_wait_zero")
    assert len(warn) == 1 and warn["severity"][0] == "WARN" and "a median of 0" in warn["detail"][0]


def test_negative_attendance_is_quarantined(env):
    content = make_xlsx([["Daily ED Attendances by Hospital"], [None], ["Date", "CGH", "SGH"],
                         [datetime(2026, 10, 25), 400, -5], [datetime(2026, 10, 26), 380, 300]])
    load(env, "moh_ed_attendances", content)
    assert len(table(env, "SELECT * FROM moh_ed_attendances")) == 3
    assert len(findings(env, "range.attendances_negative")) == 1


# ------------------------------------------------------------------ unit errors #

def _weeks(start: date, days: int, hours: dict[str, float]):
    rows = []
    for i in range(days):
        d = pd.Timestamp(start) + pd.Timedelta(days=i)
        rows.append([d.to_pydatetime(), *[h + (i % 5) * 0.3 for h in hours.values()]])
    return rows


def test_minutes_stored_as_hours_is_caught_against_stored_history(env):
    """Week 1 loads fine. Week 2's file restates the same days, but in minutes under an 'hours' header."""
    hours = {"CGH": 5.0, "SGH": 3.0}
    title = "Waiting Times (50th Percentile) for Admission from ED (hours)"
    good = bed_waits_xlsx(_weeks(date(2026, 10, 4), 14, hours), title=title)
    load(env, "moh_bed_waits", good, fetched_at=datetime(2026, 10, 19, 8))
    before = table(env, "SELECT * FROM moh_bed_waits ORDER BY ALL")

    in_minutes = bed_waits_xlsx([[r[0], *[x * 60 for x in r[1:]]] for r in _weeks(date(2026, 10, 4), 21, hours)],
                                title=title)
    load(env, "moh_bed_waits", in_minutes, fetched_at=datetime(2026, 10, 26, 8))

    f = findings(env, "unit.file_vs_stored")
    assert len(f) == 1 and f["severity"][0] == "ERROR" and "60x" in f["detail"][0]
    after = table(env, "SELECT * FROM moh_bed_waits ORDER BY ALL")
    pd.testing.assert_frame_equal(before, after)                        # clean data untouched
    assert len(table(env, "SELECT * FROM quarantine_moh_bed_waits")) == 21 * 2   # whole sheet withheld


def test_minutes_stored_as_hours_on_a_first_load_is_caught_by_plausibility(env):
    title = "Waiting Times (50th Percentile) for Admission from ED (hours)"
    minutes = bed_waits_xlsx(_weeks(date(2026, 10, 18), 14, {"CGH": 300.0, "SGH": 180.0}), title=title)
    load(env, "moh_bed_waits", minutes)
    assert len(findings(env, "unit.sheet_plausible")) == 1
    assert table(env, "SELECT * FROM moh_bed_waits").empty


def test_hours_stored_as_minutes_is_caught(env):
    """Header claims minutes, values are hours: the parser divides by 60 and the median collapses."""
    wrong = bed_waits_xlsx(_weeks(date(2026, 10, 18), 14, {"CGH": 5.0, "SGH": 3.0}),
                           title="Median waiting time (mins)")
    load(env, "moh_bed_waits", wrong)
    assert len(findings(env, "unit.sheet_plausible")) == 1


def test_a_real_one_hospital_dip_is_not_a_unit_error(env):
    """Shaped like CGH in Feb 2026: one hospital falls ~10x for weeks. Real data must load."""
    title = "Waiting Times (50th Percentile) for Admission from ED"
    history = _weeks(date(2026, 1, 4), 28, {"CGH": 8.0, "SGH": 5.0, "SKH": 4.0})
    load(env, "moh_bed_waits", bed_waits_xlsx(history, header=("Date", "CGH", "SGH", "SKH"), title=title),
         fetched_at=datetime(2026, 2, 2, 8))
    dip = _weeks(date(2026, 2, 1), 21, {"CGH": 0.6, "SGH": 5.0, "SKH": 4.0})
    load(env, "moh_bed_waits", bed_waits_xlsx(history + dip, header=("Date", "CGH", "SGH", "SKH"), title=title),
         fetched_at=datetime(2026, 2, 23, 8))
    assert table(env, "SELECT * FROM dq_findings WHERE check_id LIKE 'unit.%'").empty
    assert len(table(env, "SELECT * FROM moh_bed_waits")) == (28 + 21) * 3


# ---------------------------------------------------------------------- clinics #

from conftest import chas_geojson  # noqa: E402


def load_chas(env, content, fetched_at=FETCHED):
    wh, store, loader = env
    rec = store.save("datagov_chas", "https://s3.example.com/chas.geojson", content, http_status=200,
                     content_type="application/geo+json", fetched_at=fetched_at)
    return loader.process(rec)


def test_clinic_outside_singapore_is_quarantined(env):
    """Shaped like the real 'DA clinic @ Taman Jurong': latitude 1.016 is in the sea."""
    load_chas(env, chas_geojson([("C1", "GOOD CLINIC", "CHAS"),
                                 ("C2", "DA CLINIC @ TAMAN JURONG", "CHAS", (103.581752, 1.016264))]))
    assert list(table(env, "SELECT clinic_key FROM chas_clinics")["clinic_key"]) == ["C1"]
    q = table(env, "SELECT clinic_key, check_ids, latitude FROM quarantine_chas_clinics")
    assert q.to_dict("records") == [{"clinic_key": "C2", "check_ids": "clinic.coordinates_in_singapore",
                                     "latitude": "1.016264"}]


def test_quarantined_clinic_keeps_its_last_good_row_active(env):
    load_chas(env, chas_geojson([("C1", "CLINIC ONE", "CHAS"), ("C2", "CLINIC TWO", "CHAS")]),
              fetched_at=datetime(2026, 10, 1))
    load_chas(env, chas_geojson([("C1", "CLINIC ONE", "CHAS"), ("C2", "CLINIC TWO", "CHAS", (0.0, 0.0))]),
              fetched_at=datetime(2026, 11, 1))
    rows = table(env, "SELECT clinic_key, is_active, latitude FROM chas_clinics ORDER BY 1")
    assert rows.to_dict("records") == [{"clinic_key": "C1", "is_active": True, "latitude": 1.33},
                                       {"clinic_key": "C2", "is_active": True, "latitude": 1.33}]  # not "closed"


def test_bad_postal_code_is_published_with_a_warning(env):
    load_chas(env, chas_geojson([("C1", "CLINIC", "CHAS")], postal="12AB34"))
    assert len(table(env, "SELECT * FROM chas_clinics")) == 1
    f = findings(env, "clinic.postal_code_6_digits")
    assert len(f) == 1 and f["severity"][0] == "WARN"


def test_clinic_count_swing_is_warned(env):
    ten = [(f"C{i}", f"CLINIC {i}", "CHAS") for i in range(10)]
    load_chas(env, chas_geojson(ten), fetched_at=datetime(2026, 10, 1))
    load_chas(env, chas_geojson(ten[:9]), fetched_at=datetime(2026, 10, 8))     # -10%: fine
    assert findings(env, "clinic.count_vs_previous").empty
    load_chas(env, chas_geojson(ten[:7]), fetched_at=datetime(2026, 10, 15))    # 7 vs 9: -22%
    f = findings(env, "clinic.count_vs_previous")
    assert len(f) == 1 and "-22.2%" in f["detail"][0]
