"""Clinics, planning-area access, quality and live endpoints."""
import hashlib
import json

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from sg_health_api.config import Settings
from sg_health_api.main import create_app

API = "/api/v1"


def get(client, path, **params):
    r = client.get(f"{API}{path}", params=params)
    return r.status_code, r.json()


def names(body):
    return [c["clinic_name"] for c in body["data"]["items"]]


# ------------------------------------------------------------------ clinics #

def test_clinics_lists_active_clinics_only_with_the_list_date(client):
    status, body = get(client, "/clinics")
    assert status == 200 and names(body) == ["Alpha Clinic", "Bravo Clinic", "Charlie Clinic", "Delta Clinic"]
    assert body["data"]["total"] == 4 and body["meta"]["coverage"]["inactive_clinics_excluded"] == 1
    assert body["meta"]["as_of"] == "2024-06-06T14:36:42"
    assert any("last updated by data.gov.sg on 2024-06-06" in c for c in body["meta"]["caveats"])
    assert [w["check_id"] for w in body["meta"]["dq_warnings"]] == ["clinic.coordinates_in_singapore"]
    assert body["data"]["items"][0]["postal_code"] == "460001"


@pytest.mark.parametrize("cdmp, expected", [
    ("true", ["Alpha Clinic", "Charlie Clinic"]),           # not Echo: inactive
    ("false", ["Bravo Clinic"]),                            # not Delta: programme unknown, so neither
])
def test_cdmp_filter_never_guesses_an_unknown_programme(client, cdmp, expected):
    assert names(get(client, "/clinics", cdmp=cdmp)[1]) == expected


def test_bbox_and_paging(client):
    bedok = get(client, "/clinics", bbox="103.9,1.3,104.0,1.4")[1]
    assert names(bedok) == ["Alpha Clinic", "Bravo Clinic", "Delta Clinic"]
    page = get(client, "/clinics", limit=2, offset=2)[1]["data"]
    assert [c["clinic_name"] for c in page["items"]] == ["Charlie Clinic", "Delta Clinic"]
    assert (page["total"], page["limit"], page["offset"]) == (4, 2, 2)
    assert get(client, "/clinics", offset=10)[1]["data"] == {"items": [], "total": 4, "limit": 100, "offset": 10}


@pytest.mark.parametrize("params, field", [
    ({"limit": 501}, "limit"), ({"limit": 0}, "limit"), ({"offset": -1}, "offset"), ({"cdmp": "maybe"}, "cdmp")])
def test_paging_and_filter_limits(client, params, field):
    status, body = get(client, "/clinics", **params)
    assert status == 400 and body["error"]["code"] == "invalid_parameter" and body["error"]["field"] == field


@pytest.mark.parametrize("bbox", ["1,2,3", "a,b,c,d", "104,1.2,103,1.5", "nan,1,2,3", "103.6,1.2,104.1,95",
                                  "103.6,1.2,104.1,1.5;DROP TABLE x"])
def test_malformed_bboxes_are_refused(client, bbox):
    status, body = get(client, "/clinics", bbox=bbox)
    assert status == 400 and body["error"]["code"] == "invalid_bbox" and body["error"]["field"] == "bbox"


# -------------------------------------------------------------------- areas #

def test_areas_returns_the_geojson_with_nulls_kept(client):
    r = client.get(f"{API}/areas/access")
    body = r.json()
    assert r.status_code == 200 and r.headers["content-type"] == "application/json" and "etag" in r.headers
    fc = body["data"]
    assert fc["type"] == "FeatureCollection" and len(fc["features"]) == 2
    tuas = next(f["properties"] for f in fc["features"] if f["properties"]["planning_area_code"] == "TS")
    assert tuas["clinics_per_1k_seniors"] is None and tuas["dq_note"] == "no residents"
    meta = body["meta"]
    assert meta["as_of"] == "2024-06-06T14:36:42"                          # the older input
    assert {s["id"] for s in meta["sources"]} == {"datagov_chas", "singstat_residents", "datagov_planning_areas",
                                                  "datagov_polyclinics"}
    assert meta["coverage"] == {"planning_areas": 2, "with_population": 2, "with_a_dq_note": 1}
    assert any("never as 0" in c for c in meta["caveats"])


def replace_and_rehash(snap, rel, content: bytes):
    (snap / rel).write_bytes(content)
    m = json.loads((snap / "manifest.json").read_text())
    m["artefacts"][rel] = {"sha256": hashlib.sha256(content).hexdigest(), "bytes": len(content)}
    (snap / "manifest.json").write_text(json.dumps(m))


def test_a_malformed_map_layer_stops_startup_even_with_matching_hashes(fresh_snapshot):
    bad = {"type": "FeatureCollection", "features": [{"type": "Feature", "geometry": {"type": "Point",
                                                                                      "coordinates": [1, 2]},
                                                      "properties": {}}]}
    replace_and_rehash(fresh_snapshot, "planning_area_access.geojson", json.dumps(bad).encode())
    with pytest.raises(ValidationError):
        with TestClient(create_app(Settings(local_snapshot_path=fresh_snapshot))):
            pass


# ------------------------------------------------------------------ quality #

def test_quality_serves_the_latest_run_only(client):
    status, body = get(client, "/quality")
    q = body["data"]
    assert status == 200 and q["run_id"] == "run-latest" and len(q["results"]) == 5
    assert q["counts"] == {"fail": 2, "pass": 2, "skipped": 1} and q["blocking"] == 0
    bed = next(r for r in q["results"] if r["check_id"] == "range.bed_wait_over_24h")
    assert bed["failing_rows"] == 1                                         # the old run had 9
    assert body["meta"]["as_of"] == "2026-11-01T16:34:00"


# --------------------------------------------------------------------- live #

def test_live_gives_each_sites_latest_reading_and_says_it_is_not_live(client):
    status, body = get(client, "/live/nuhs/latest")
    rows = [(r["hospital_code"], r["department"], r["patients_waiting"], r["snapshot_at"]) for r in body["data"]]
    assert status == 200 and rows == [
        ("AH", "Adult Emergency", 4, "2026-11-01T12:01:49"),
        ("NTFGH", "Adult Emergency", 12, "2026-10-31T20:00:00"),              # only in the older snapshot
        ("NUH", "Adult Emergency", 18, "2026-11-01T12:01:49"),                # the newer of NUH's two readings
        ("NUH", "Children's Emergency", 2, "2026-11-01T12:01:49")]
    meta = body["meta"]
    assert meta["as_of"] == "2026-11-01T12:01:49" and meta["coverage"]["oldest_snapshot_at"] == "2026-10-31T20:00:00"
    assert any("not a live feed" in c for c in meta["caveats"]) and any("is_adult_ed" in c for c in meta["caveats"])
    assert [s["id"] for s in meta["sources"]] == ["nuhs_live"]
