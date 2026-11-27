"""R2: a source that lands nothing usable makes `sg-health run` exit 3 (partial), never a silent 0."""
import json

from conftest import HTML, FakeHttp, source_routes

from sg_health import cli


def run(monkeypatch, paths, routes):
    monkeypatch.setattr(cli, "PoliteHttp", lambda: FakeHttp(routes))
    return cli.main(["--db", str(paths["db"]), "--raw-dir", str(paths["raw"]), "--report", str(paths["report"]), "run"])


def failed_lines(capsys):
    out = []
    for line in capsys.readouterr().err.splitlines():
        try:
            rec = json.loads(line)
        except ValueError:
            continue
        if rec.get("event") == "source_failed":
            out.append(rec["source"])
    return out


def test_a_clean_run_exits_0(monkeypatch, paths, capsys):
    assert run(monkeypatch, paths, source_routes()) == 0
    assert failed_lines(capsys) == []


def test_an_error_page_instead_of_the_workbook_is_a_partial_failure(monkeypatch, paths, capsys):
    routes = source_routes()
    routes["https://www.moh.gov.sg/files/bed-waits-wk43.xlsx"] = (b"<html>Access denied</html>", HTML)
    assert run(monkeypatch, paths, routes) == cli.EXIT_PARTIAL
    assert failed_lines(capsys) == ["moh_bed_waits"]


def test_a_source_that_is_down_is_a_partial_failure(monkeypatch, paths, capsys):
    from sg_health import config
    routes = source_routes()
    del routes[config.NUHS_LIVE_URL]                          # FakeHttp answers None, as for a 5xx or a robots block
    assert run(monkeypatch, paths, routes) == cli.EXIT_PARTIAL
    assert failed_lines(capsys) == ["nuhs_live"]


def test_an_unchanged_moh_file_is_not_a_failure(monkeypatch, paths, capsys):
    assert run(monkeypatch, paths, source_routes()) == 0
    assert run(monkeypatch, paths, source_routes()) == 0       # second fetch: same sha256, skipped on purpose
    assert failed_lines(capsys) == []
