"""Shared fixtures: synthetic source files and a fake HTTP client. No network needed."""
from __future__ import annotations

import io
import json
import zipfile
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
    def __init__(self, content: bytes, content_type: str, status: int = 200,
                 url: Optional[str] = None) -> None:
        self.content = content
        self.status_code = status
        self.headers = {"Content-Type": content_type}
        self.url = url               # final URL after redirects (requests.Response.url)

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
        if not hit:
            return None
        content, ctype, *final = hit           # optional 3rd item: the URL it redirected to
        return FakeResponse(content, ctype, url=final[0] if final else url)

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


def chas_geojson(clinics: list[tuple], postal: str = "629117") -> bytes:
    """clinics: (hci_code, name, programmes[, (lon, lat)])."""
    feats = []
    for hci, name, prog, *where in clinics:
        lon, lat = where[0] if where else (103.68, 1.33)
        desc = (f"<table><tr><th>HCI_CODE</th><td>{hci}</td></tr><tr><th>HCI_NAME</th><td>{name}</td></tr>"
                f"<tr><th>POSTAL_CD</th><td>{postal}</td></tr>"
                f"<tr><th>CLINIC_PROGRAMME_CODE</th><td>{prog}</td></tr></table>")
        feats.append({"type": "Feature", "properties": {"Name": "kml_1", "Description": desc},
                      "geometry": {"type": "Point", "coordinates": [lon, lat]}})
    return json.dumps({"type": "FeatureCollection", "features": feats}).encode()


CHAS_V1 = chas_geojson([("15M0211", "JOO KOON CLINIC", "CHAS,CDMP"), ("15M0999", "OTHER CLINIC", "CHAS")])
CHAS_V2 = chas_geojson([("15M0211", "JOO KOON CLINIC", "CHAS,CDMP")])          # OTHER CLINIC closed
ANNUAL_AE_CSV = (b"year,level_1,value\n2023,Accident & Emergency Departments,1050400.0\n"
                 b"2023,Polyclinics,5000000.0\n2022,Accident & Emergency Departments,1023000.0\n")
ANNUAL_AE_DOWNLOAD = "https://s3.example.com/annual.csv"


def singstat_residents_zip(rows=None, columns=("PA", "SZ", "AG", "Sex", "TOD", "Pop", "Time")) -> bytes:
    """A zip laid out like SingStat's respopagesextod file: a data CSV plus a notes CSV."""
    rows = rows if rows is not None else [
        ("Bedok", "Bedok North", "60_to_64", "Males", "HDB 4-Room Flats", 1000, 2026),
        ("Bedok", "Bedok North", "65_to_69", "Males", "HDB 4-Room Flats", 800, 2026),
        ("Bedok", "Bedok North", "90_and_Over", "Females", "Others", 40, 2026),
        ("Bedok", "Kembangan", "70_to_74", "Females", "Landed Properties", 160, 2026),
        ("Tuas", "Tuas North", "65_to_69", "Males", "Others", 0, 2026),
    ]
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("Notes_respopagesextod2026.csv", "Notes\n3) The figures have been rounded to the nearest 10.\n")
        z.writestr("respopagesextod2026.csv",
                   ",".join(columns) + "\n" + "".join(",".join(map(str, r)) + "\n" for r in rows))
    return buf.getvalue()


SINGSTAT_ZIP = singstat_residents_zip()



def planning_area_geojson(areas=None) -> bytes:
    """URA-style boundary file: squares (lon0, lat0, lon1, lat1) named like the fixture's SingStat areas."""
    areas = areas if areas is not None else [("BD", "BEDOK", "EAST REGION", (103.65, 1.30, 103.72, 1.36)),
                                             ("TS", "TUAS", "WEST REGION", (103.60, 1.28, 103.64, 1.32))]
    feats = []
    for code, name, region, (x0, y0, x1, y1) in areas:
        feats.append({"type": "Feature",
                      "properties": {"PLN_AREA_N": name, "PLN_AREA_C": code, "REGION_N": region},
                      "geometry": {"type": "Polygon", "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]}})
    return json.dumps({"type": "FeatureCollection", "features": feats}).encode()


PLANNING_AREAS = planning_area_geojson()


def polyclinics_geojson(rows=None) -> bytes:
    """HPB screening-centre layout: NAME, address parts, Point geometry (lon, lat)."""
    rows = rows if rows is not None else [("Bedok Polyclinic", 103.69, 1.34), ("Tuas Polyclinic", 103.62, 1.29)]
    feats = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
              "properties": {"NAME": name, "ADDRESSBLOCKHOUSENUMBER": "1", "ADDRESSSTREETNAME": "Some Street",
                             "ADDRESSPOSTALCODE": "123456", "ADDRESSFLOORNUMBER": None, "ADDRESSUNITNUMBER": None}}
             for name, lon, lat in rows]
    return json.dumps({"type": "FeatureCollection", "features": feats}).encode()


POLYCLINICS = polyclinics_geojson()
POLYCLINICS_DOWNLOAD = f"https://s3.example.com/blobs.data.gov.sg/{config.DATAGOV_DATASETS['polyclinics']}.geojson"
PLANNING_AREAS_DOWNLOAD = f"https://s3.example.com/blobs.data.gov.sg/{config.DATAGOV_DATASETS['planning_areas']}.geojson"
# Same shape as the real signed link: the object path is the dataset id.
CHAS_DOWNLOAD = (f"https://s3.example.com/blobs.data.gov.sg/{config.DATAGOV_DATASETS['chas']}.geojson"
                 "?X-Amz-Signature=secret&X-Amz-Expires=60")


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
        poll.format(config.DATAGOV_DATASETS["chas"]):
            (json.dumps({"data": {"url": CHAS_DOWNLOAD}}).encode(), JSON),
        CHAS_DOWNLOAD: (chas, "application/geo+json"),
        poll.format(config.DATAGOV_DATASETS["annual_ae"]):
            (json.dumps({"data": {"url": ANNUAL_AE_DOWNLOAD}}).encode(), JSON),
        ANNUAL_AE_DOWNLOAD: (ANNUAL_AE_CSV, "text/csv"),
        poll.format(config.DATAGOV_DATASETS["planning_areas"]):
            (json.dumps({"data": {"url": PLANNING_AREAS_DOWNLOAD}}).encode(), JSON),
        PLANNING_AREAS_DOWNLOAD: (PLANNING_AREAS, "application/geo+json"),
        poll.format(config.DATAGOV_DATASETS["polyclinics"]):
            (json.dumps({"data": {"url": POLYCLINICS_DOWNLOAD}}).encode(), JSON),
        POLYCLINICS_DOWNLOAD: (POLYCLINICS, "application/geo+json"),
        **{config.DATAGOV_METADATA_URL.format(dataset_id=ds): (json.dumps({"code": 0, "data": {
            "datasetId": ds, "name": name, "managedBy": "Ministry of Health",
            "lastUpdatedAt": updated}}).encode(), JSON)
           for ds, name, updated in [(config.DATAGOV_DATASETS["chas"], "CHAS Clinics", "2024-06-06T14:36:42+08:00"),
                                     (config.DATAGOV_DATASETS["annual_ae"], "Annual", "2026-10-28T08:54:55+08:00"),
                                     (config.DATAGOV_DATASETS["planning_areas"], "MP2025 PA", "2026-02-27T10:07:02+08:00"),
                                     (config.DATAGOV_DATASETS["polyclinics"], "Cervical Screening Centre", "2026-01-04T10:00:00+08:00")]},
        config.SINGSTAT_RESIDENTS_URL: (SINGSTAT_ZIP, "application/zip"),
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
