"""Structured logging: JSON lines, one summary per source, counts that reconcile."""
import json
import logging

import pytest
from conftest import BED_WAITS_XLSX
from test_ingest import full_run

from sg_health import cli
from sg_health.logs import JsonFormatter, ParseStats
from sg_health.parsers.moh import parse_moh_workbook

pytest.importorskip("duckdb")

RUN_SOURCES = {"moh_bed_waits", "moh_ed_attendances", "nuhs_live", "datagov_chas", "datagov_annual_ae",
               "datagov_metadata", "datagov_planning_areas", "datagov_polyclinics", "singstat_residents"}


def summaries(capsys) -> list[dict]:
    lines = [json.loads(line) for line in capsys.readouterr().err.splitlines() if line.strip()]
    return [line for line in lines if line.get("event") == "source_summary"]


def test_every_log_line_is_json(monkeypatch, paths, capsys):
    full_run(monkeypatch, paths)
    lines = [line for line in capsys.readouterr().err.splitlines() if line.strip()]
    assert lines
    for line in lines:
        rec = json.loads(line)
        assert {"ts", "level", "logger", "msg"} <= set(rec)
        assert rec["ts"].endswith("+08:00")                  # SGT


def test_one_summary_line_per_source_and_counts_reconcile(monkeypatch, paths, capsys):
    full_run(monkeypatch, paths)
    lines = summaries(capsys)
    assert sorted(line["source"] for line in lines) == sorted(RUN_SOURCES)   # exactly one each
    for line in lines:
        assert line["command"] == "run"
        assert line["rows_read"] == line["parsed"] + line["dropped"], line
        assert line["dropped"] == sum(line["drop_reasons"].values())
    bed = next(line for line in lines if line["source"] == "moh_bed_waits")
    # Fixture: 3 hospitals x 2 dates, one cell is "-" (MOH's blank marker): missing, not unreadable
    assert (bed["rows_read"], bed["parsed"], bed["drop_reasons"]) == (6, 5, {"blank": 1})
    singstat = next(line for line in lines if line["source"] == "singstat_residents")
    assert (singstat["rows_read"], singstat["parsed"]) == (2, 2)          # two planning areas


def test_unchanged_file_shows_as_skipped(monkeypatch, paths, capsys):
    full_run(monkeypatch, paths)
    capsys.readouterr()
    full_run(monkeypatch, paths)
    bed = next(line for line in summaries(capsys) if line["source"] == "moh_bed_waits")
    assert bed["files"] == 1 and bed["files_skipped"] == {"unchanged": 1}
    assert bed["rows_read"] == 0


def test_source_that_returned_nothing_still_gets_a_line(monkeypatch, paths, capsys):
    from test_ingest import run_cli
    run_cli(monkeypatch, paths, {}, "run", "--sources", "live", "--no-report")   # every URL misses
    lines = summaries(capsys)
    assert {line["source"] for line in lines} == {"nuhs_live"}
    assert all(line["files"] == 0 and line["rows_read"] == 0 for line in lines)


def test_reparse_logs_a_summary_for_every_loader(monkeypatch, paths, capsys):
    full_run(monkeypatch, paths)
    capsys.readouterr()
    assert cli.main(["--db", str(paths["db"]), "--raw-dir", str(paths["raw"]),
                     "--report", str(paths["report"]), "reparse"]) == 0
    lines = summaries(capsys)
    assert {line["source"] for line in lines} == RUN_SOURCES
    assert all(line["command"] == "reparse" for line in lines)


def test_moh_parser_counts_unparseable_and_blank_cells():
    import io

    from openpyxl import Workbook
    wb = Workbook()
    rows = [["Date", "SGH", "CGH"], ["25/10/2026", "03:00", "not a time"], ["26/10/2026", "04:00", "05:00"]]
    for r in rows:
        wb.active.append(r)
    second = wb.create_sheet("Revised")                  # restates SGH on 26/10: a duplicate key
    for r in [["Date", "SGH", "CGH"], ["26/10/2026", "04:30", None], ["27/10/2026", "04:10", "05:10"]]:
        second.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    stats = ParseStats()
    df = parse_moh_workbook(buf.getvalue(), "bed_waits", stats=stats)
    assert stats.rows_read == 8
    # "not a time" can't be read; the empty cell is blank. SGH 26/10 appears on both sheets with
    # different values: the parser keeps both and leaves the decision to the data-quality gate.
    assert stats.drop_reasons == {"unparseable_value": 1, "blank": 1}
    assert len(df) == stats.rows_read - stats.dropped == 6
    assert df.duplicated(["hospital_code", "report_date"]).sum() == 1


def test_moh_parser_stats_on_the_shared_fixture():
    stats = ParseStats()
    parse_moh_workbook(BED_WAITS_XLSX, "bed_waits", stats=stats)
    assert (stats.rows_read, stats.dropped) == (6, 1)


def test_json_formatter_merges_fields():
    rec = logging.LogRecord("sg_health.x", logging.INFO, __file__, 1, "hello %s", ("you",), None)
    rec.fields = {"event": "source_summary", "rows_read": 3}
    out = json.loads(JsonFormatter().format(rec))
    assert out["msg"] == "hello you" and out["event"] == "source_summary" and out["rows_read"] == 3
