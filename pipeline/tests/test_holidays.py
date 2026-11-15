"""Public holidays: parsing, the load gate's checks, and the dim_event mart that chart annotations read."""
import pandas as pd
import pytest
from conftest import HOLIDAYS_CSV, HOLIDAYS_DOWNLOAD, source_routes
from test_ingest import full_run

from sg_health.parsers.datagov import parse_public_holidays
from sg_health.warehouse import Warehouse

pytest.importorskip("duckdb")


def test_parser_keeps_names_exactly_as_published_and_reads_real_dates():
    df = parse_public_holidays(HOLIDAYS_CSV)
    assert list(df.columns) == ["holiday_date", "holiday_name"]
    assert len(df) == 8
    assert df.iloc[0].holiday_name == "New Year’s Day"            # the curly apostrophe is kept
    assert str(df.iloc[1].holiday_date) == "2026-02-17" and df.iloc[1].holiday_name == df.iloc[2].holiday_name


def test_parser_drops_and_counts_a_bad_date_or_blank_name_never_repairs_it():
    from sg_health.logs import ParseStats
    stats = ParseStats()
    csv = b"date,day,holiday\n2026-02-30,Monday,Not a day\n2026-05-01,Friday,\n2026-05-01,Friday,Labour Day\n"
    df = parse_public_holidays(csv, stats=stats)
    assert df.holiday_name.tolist() == ["Labour Day"]
    assert stats.dropped == 2


def test_parser_refuses_a_file_without_the_expected_columns():
    with pytest.raises(ValueError, match="expected columns"):
        parse_public_holidays(b"when,what\n2026-01-01,New Year\n")


def test_dim_event_has_holidays_and_the_hospital_that_starts_part_way(monkeypatch, paths):
    full_run(monkeypatch, paths)
    wh = Warehouse(paths["db"])
    try:
        ev = wh.query("SELECT * FROM marts.dim_event ORDER BY event_date, kind, label")
        n_ref = wh.query("SELECT count(*) AS n FROM marts.dim_hospital WHERE reported_from IS NOT NULL")["n"][0]
    finally:
        wh.close()
    assert (ev["kind"] == "holiday").sum() == 8 and (ev["kind"] == "source_change").sum() == n_ref == 1
    wood = ev[ev["kind"] == "source_change"].iloc[0]
    assert str(wood["event_date"])[:10] == "2024-06-23" and wood["label"] == "Woodlands starts in MOH's figures"
    hol = ev[ev["kind"] == "holiday"].iloc[0]
    assert hol["as_of_basis"] == "source_updated" and hol["as_of"] == pd.Timestamp("2026-07-03 16:04:00")
    assert ev["source_sha256"].notna().all() and ev["label"].str.strip().ne("").all()


def test_a_year_with_too_few_holidays_warns_but_does_not_block(monkeypatch, paths):
    routes = source_routes()
    routes[HOLIDAYS_DOWNLOAD] = (b"date,day,holiday\n2026-01-01,Thursday,New Year\n2026-05-01,Friday,Labour Day\n", "text/csv")
    full_run(monkeypatch, paths, routes)
    wh = Warehouse(paths["db"])
    try:
        found = wh.query("SELECT check_id, severity FROM main.dq_findings WHERE check_id LIKE 'holiday.%'")
        loaded = wh.query("SELECT count(*) AS n FROM main.public_holidays")["n"][0]
    finally:
        wh.close()
    assert found.to_dict("records") == [{"check_id": "holiday.year_has_enough_days", "severity": "WARN"}]
    assert loaded == 2                                    # a warning never withholds rows
