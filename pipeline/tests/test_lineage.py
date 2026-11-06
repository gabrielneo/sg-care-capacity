"""Every parsed row carries source_url, source_sha256 and ingested_at, and they point at a raw file."""
import pytest

from sg_health.raw import RawStore, link_url
from sg_health.warehouse import LINEAGE_COLUMNS, PARSED_TABLES, Warehouse

from test_ingest import full_run

pytest.importorskip("duckdb")


def test_every_parsed_table_has_lineage_columns(tmp_path):
    wh = Warehouse(tmp_path / "w.duckdb")
    try:
        for table in PARSED_TABLES:
            cols = set(wh.query(f"DESCRIBE {table}")["column_name"])
            assert set(LINEAGE_COLUMNS) <= cols, table
    finally:
        wh.close()


def test_every_row_points_at_the_raw_file_it_came_from(monkeypatch, paths):
    full_run(monkeypatch, paths)
    raw = {(r.sha256, link_url(r.url)): r for r in RawStore(paths["raw"]).records()}
    wh = Warehouse(paths["db"])
    try:
        for table in PARSED_TABLES:
            rows = wh.query(f"SELECT source_url, source_sha256, ingested_at FROM {table}")
            assert len(rows), table
            assert rows.notna().all().all(), table
            for row in rows.itertuples():
                rec = raw.get((row.source_sha256, row.source_url))
                assert rec is not None, (table, row)
                assert row.ingested_at.to_pydatetime() == rec.fetched_at   # fetch time, not parse time
                assert (paths["raw"] / rec.path).exists()
    finally:
        wh.close()


def test_derived_population_points_at_the_singstat_file(monkeypatch, paths):
    full_run(monkeypatch, paths)
    singstat = next(r for r in RawStore(paths["raw"]).records() if r.source == "singstat")
    wh = Warehouse(paths["db"])
    try:
        pop = wh.query("SELECT source_sha256, source_table FROM pop_65plus_by_area")
    finally:
        wh.close()
    assert list(pop["source_sha256"]) == [singstat.sha256]
    assert list(pop["source_table"]) == ["M810001"]
