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


def test_areas_carry_the_access_gap_exclusions_and_shortfall(client):
    props = {f["properties"]["planning_area_code"]: f["properties"] for f in get(client, "/areas/access")[1]["data"]["features"]}
    assert (props["BD"]["excluded_reason"], props["BD"]["cdmp_shortfall"]) == (None, 1.0)
    assert (props["TS"]["excluded_reason"], props["TS"]["cdmp_shortfall"]) == ("no residents aged 65+", None)


def test_the_svy21_layer_serves_metres_with_its_origin_and_label_points(client):
    status, body = get(client, "/areas/access/svy21")
    assert status == 200
    fc = body["data"]
    assert fc["metadata"]["origin"] == [29537, 33000] and len(fc["features"]) == 2
    bedok = next(f for f in fc["features"] if f["properties"]["planning_area_code"] == "BD")
    assert bedok["geometry"]["coordinates"][0][0] == [9000, -1000]                     # metres, not degrees
    assert (bedok["properties"]["label_x"], bedok["properties"]["label_y"]) == (9500, -500)
    assert bedok["properties"]["cdmp_shortfall"] == 1.0
    assert any("SVY21" in c for c in body["meta"]["caveats"]) and body["meta"]["as_of"] == "2024-06-06T14:36:42"


def test_a_release_without_the_3d_layer_says_so_with_a_404(tmp_path):
    from fixture_snapshot import build

    snap = build(tmp_path / "old", svy21=False)
    with TestClient(create_app(Settings(local_snapshot_path=snap))) as c:
        r = c.get(f"{API}/areas/access/svy21")
        assert c.get(f"{API}/areas/access").status_code == 200                       # the 2D layer is unaffected
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_in_release"


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


def test_live_says_when_nuhs_gave_a_bound_not_a_value(client):
    # NUHS writes "< 1 hour(s)": the hours are the bound, and the qualifier says so (audit C-1).
    _, body = get(client, "/live/nuhs/latest")
    q = {(r["hospital_code"], r["department"]): (r["est_wait_to_see_doctor_qualifier"], r["est_bed_wait_qualifier"])
         for r in body["data"]}
    assert q == {("AH", "Adult Emergency"): ("<", None), ("NTFGH", "Adult Emergency"): (None, None),
                 ("NUH", "Adult Emergency"): (None, None), ("NUH", "Children's Emergency"): (None, "<")}


def test_a_release_from_before_the_qualifiers_still_serves_live_readings(tmp_path):
    from fixture_snapshot import build

    snap = build(tmp_path / "old", live_qualifiers=False)
    with TestClient(create_app(Settings(local_snapshot_path=snap))) as c:
        r = c.get(f"{API}/live/nuhs/latest")
    assert r.status_code == 200 and len(r.json()["data"]) == 4
    assert {(x["est_wait_to_see_doctor_qualifier"], x["est_bed_wait_qualifier"]) for x in r.json()["data"]} == {(None, None)}


# -------------------------------------------------------------- polyclinics #

def test_polyclinics_lists_every_polyclinic_with_the_list_date(client):
    status, body = get(client, "/polyclinics")
    assert status == 200
    assert [p["polyclinic_name"] for p in body["data"]] == ["Bedok Polyclinic", "Woodlands Polyclinic"]
    assert body["data"][0]["postal_code"] == "469662" and body["data"][0]["latitude"] == 1.326
    assert body["meta"]["as_of"] == "2026-01-04T10:06:46" and body["meta"]["coverage"] == {"polyclinics": 2}
    assert [s["id"] for s in body["meta"]["sources"]] == ["datagov_polyclinics"]
    assert any("HPB" in c for c in body["meta"]["caveats"])


def test_hospitals_carry_their_map_pins(client):
    _, body = get(client, "/hospitals")
    sgh = next(h for h in body["data"] if h["hospital_code"] == "SGH")
    assert (sgh["postal_code"], sgh["latitude"], sgh["longitude"]) == ("169608", 1.278429, 103.834043)


def test_a_release_from_before_the_places_still_starts(tmp_path):
    from fixture_snapshot import build

    snap = build(tmp_path / "old", places=False)
    with TestClient(create_app(Settings(local_snapshot_path=snap))) as c:
        poly = c.get(f"{API}/polyclinics")
        hospitals = c.get(f"{API}/hospitals")
    assert poly.status_code == 404 and poly.json()["error"]["code"] == "not_in_release"
    assert hospitals.status_code == 200
    assert {(h["latitude"], h["longitude"]) for h in hospitals.json()["data"]} == {(None, None)}
