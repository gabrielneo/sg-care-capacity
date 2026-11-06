"""Shared fixtures: synthetic source files and a fake HTTP client. No network needed."""
from __future__ import annotations

import io
import json
from datetime import datetime, time
from typing import Any, Optional

import pytest
from openpyxl import Workbook

from sg_health import config

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
HTML = "text/html; charset=utf-8"
JSON = "application/json"


def make_xlsx(rows, sheet="Sheet1") -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = sheet
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


class FakeResponse:
    def __init__(self, content: bytes, content_type: str, status: int = 200) -> None:
        self.content = content
        self.status_code = status
        self.headers = {"Content-Type": content_type}

    @property
    def text(self) -> str:
        return self.content.decode("utf-8")

    def json(self) -> Any:
        return json.loads(self.content)


class FakeHttp:
    """Duck-types PoliteHttp. Serves bytes from ``routes``; any other URL is a miss (None)."""

    def __init__(self, routes: dict[str, tuple[bytes, str]]) -> None:
        self.routes = dict(routes)
        self.calls: list[str] = []

    def get(self, url: str, **_: Any) -> Optional[FakeResponse]:
        self.calls.append(url)
        hit = self.routes.get(url)
        return FakeResponse(*hit) if hit else None

    def get_text(self, url, **kw):
        r = self.get(url, **kw)
        return r.text if r else None

    def get_bytes(self, url, **kw):
        r = self.get(url, **kw)
        return r.content if r else None

    def get_json(self, url, **kw):
        r = self.get(url, **kw)
        return r.json() if r else None


BED_WAITS_XLSX = make_xlsx([
    ["Waiting Time for Admission to Ward (Median)"],
    ["Date", "CGH", "SGH", "TTSH"],
    [datetime(2026, 10, 25), time(5, 0), time(3, 0), "-"],
    [datetime(2026, 10, 26), time(4, 30), time(3, 15), time(4, 45)],
])
ATTENDANCES_XLSX = make_xlsx([
    ["Daily ED Attendances (2026)"],
    ["Date", "CGH", "SGH"],
    [datetime(2026, 10, 25), 400, 412],
    [datetime(2026, 10, 26), 380, "1,050"],
])
NUHS_HTML = b"""<h2>Emergency Department</h2><table>
 <tr><th></th><th>National University Hospital</th><th>Ng Teng Fong General Hospital</th></tr>
 <tr><td>Number of Patients Waiting for Consult</td><td>4 patient(s)</td><td>15 patient(s)</td></tr>
 <tr><td>Estimated Bed Wait Time</td><td>3 hour(s)</td><td>26 hour(s)</td></tr></table>
 <p>Last updated at 18 May 2026, 09:30:04 AM.</p>"""
QWATCH_HTML = b"""<table><tr><th>SingHealth Polyclinics</th><th>Total Waiting Time (in Minutes)**</th></tr>
 <tr><td>Bukit Merah Polyclinic</td><td>CLOSED</td></tr><tr><td>Tampines Polyclinic</td><td>35</td></tr></table>"""


def chas_geojson(clinics: list[tuple[str, str, str]]) -> bytes:
    """clinics: (hci_code, name, programmes)."""
    feats = []
    for hci, name, prog in clinics:
        desc = (f"<table><tr><th>HCI_CODE</th><td>{hci}</td></tr><tr><th>HCI_NAME</th><td>{name}</td></tr>"
                f"<tr><th>POSTAL_CD</th><td>629117</td></tr>"
                f"<tr><th>CLINIC_PROGRAMME_CODE</th><td>{prog}</td></tr></table>")
        feats.append({"type": "Feature", "properties": {"Name": "kml_1", "Description": desc},
                      "geometry": {"type": "Point", "coordinates": [103.68, 1.33]}})
    return json.dumps({"type": "FeatureCollection", "features": feats}).encode()


CHAS_V1 = chas_geojson([("15M0211", "JOO KOON CLINIC", "CHAS,CDMP"), ("15M0999", "OTHER CLINIC", "CHAS")])
CHAS_V2 = chas_geojson([("15M0211", "JOO KOON CLINIC", "CHAS,CDMP")])          # OTHER CLINIC closed
HAS_CSV = b"clinic_name,address,postal_code,latitude,longitude\nA Clinic,1 Road,18989,1.3,103.8\n"
SINGSTAT_JSON = json.dumps({"Data": {"title": "Residents by Planning Area and Age Group, June 2025", "row": [
    {"rowText": "Bedok", "columns": [{"key": "2025", "columns": [
        {"key": "60 - 64", "value": "20,000"}, {"key": "65 - 69", "value": "18,000"},
        {"key": "90 & Over", "value": "1,200"}]}]},
]}}).encode()

SINGSTAT_TABLE = "M810001"
CHAS_DOWNLOAD = "https://s3.example.com/chas.geojson?X-Amz-Signature=secret&X-Amz-Expires=60"
HAS_DOWNLOAD = "https://s3.example.com/has.csv"


def source_routes(chas: bytes = CHAS_V1) -> dict[str, tuple[bytes, str]]:
    """Every URL a full `run` fetches, mapped to fixture bytes."""
    bw, ed = config.MOH_SOURCES["bed_waits"], config.MOH_SOURCES["ed_attendances"]
    poll = config.DATAGOV_BASE + "/{}/poll-download"
    return {
        bw["url"]: (b'<a href="/files/bed-waits-wk43.xlsx">Download</a>', HTML),
        ed["url"]: (b'<a href="/files/ed-attendances-wk43.xlsx">Download</a>', HTML),
        "https://www.moh.gov.sg/files/bed-waits-wk43.xlsx": (BED_WAITS_XLSX, XLSX),
        "https://www.moh.gov.sg/files/ed-attendances-wk43.xlsx": (ATTENDANCES_XLSX, XLSX),
        config.NUHS_LIVE_URL: (NUHS_HTML, HTML),
        config.SINGHEALTH_QWATCH_URL: (QWATCH_HTML, HTML),
        poll.format(config.DATAGOV_DATASETS["chas"]):
            (json.dumps({"data": {"url": CHAS_DOWNLOAD}}).encode(), JSON),
        poll.format(config.DATAGOV_DATASETS["has"]):
            (json.dumps({"data": {"url": HAS_DOWNLOAD}}).encode(), JSON),
        CHAS_DOWNLOAD: (chas, "application/geo+json"),
        HAS_DOWNLOAD: (HAS_CSV, "text/csv"),
        config.SINGSTAT_URL.format(table_id=SINGSTAT_TABLE): (SINGSTAT_JSON, JSON),
    }


@pytest.fixture(autouse=True)
def no_playwright(monkeypatch):
    """Never launch a browser in tests."""
    monkeypatch.setattr("sg_health.sources.live.render_with_playwright", lambda url: None)


@pytest.fixture(autouse=True)
def reset_log_handlers():
    """cli.main() installs a JSON handler on the root logger; remove it after each test."""
    import logging
    yield
    root = logging.getLogger()
    for h in list(root.handlers):
        if getattr(h, "_sg_health", False):
            root.removeHandler(h)


@pytest.fixture
def paths(tmp_path):
    return {"db": tmp_path / "build" / "warehouse.duckdb", "raw": tmp_path / "raw",
            "report": tmp_path / "build" / "report.xlsx"}
