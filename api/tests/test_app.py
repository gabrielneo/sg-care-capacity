"""App-wide behaviour: startup refusal, envelope, errors, ETag and Cache-Control, CORS."""
import pytest
from fastapi.testclient import TestClient
from fixture_snapshot import CREATED_AT, SNAPSHOT_ID

from sg_health_api.config import ConfigError, Settings
from sg_health_api.main import create_app
from sg_health_api.snapshot import SnapshotError

API = "/api/v1"


# ----------------------------------------------------------------- startup #

def test_startup_is_refused_when_the_snapshot_fails_verification(fresh_snapshot):
    (fresh_snapshot / "analytics.duckdb").write_bytes(b"tampered")
    with pytest.raises(SnapshotError, match="failed verification"):
        with TestClient(create_app(Settings(local_snapshot_path=fresh_snapshot))):
            pass


def test_startup_is_refused_for_a_wildcard_cors_origin(monkeypatch):
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "*")
    with pytest.raises(ConfigError):
        create_app()


# -------------------------------------------------------------- /meta etc #

def test_meta_describes_the_snapshot_and_only_the_latest_check_run(client):
    body = client.get(f"{API}/meta").json()
    assert body["data"]["snapshot_id"] == SNAPSHOT_ID and body["data"]["release_tag"] is None
    assert body["data"]["row_counts"]["fct_ed_daily"] == 138 and body["data"]["checks"]["blocking"] == 0
    meta = body["meta"]
    assert meta["snapshot_id"] == SNAPSHOT_ID and meta["as_of"] == CREATED_AT
    assert {s["id"] for s in meta["sources"]} >= {"moh_bed_waits", "datagov_chas", "singstat_residents", "nuhs_live"}
    chas = next(s for s in meta["sources"] if s["id"] == "datagov_chas")
    assert chas["as_of"] == "2024-06-06T14:36:42" and chas["url"].startswith("https://data.gov.sg/datasets/")
    warn = {(w["check_id"], w["failing_rows"]) for w in meta["dq_warnings"]}
    assert warn == {("range.bed_wait_over_24h", 1), ("clinic.coordinates_in_singapore", 1)}   # not the old run's 9


def test_health_is_never_cached(client):
    r = client.get(f"{API}/health")
    assert r.status_code == 200 and r.json()["data"] == {"status": "ok", "snapshot_id": SNAPSHOT_ID}
    assert r.headers["cache-control"] == "no-store" and "etag" not in r.headers


# ------------------------------------------------------------------ errors #

def test_unknown_endpoint_is_a_404_in_the_same_envelope(client):
    r = client.get(f"{API}/nope")
    body = r.json()
    assert r.status_code == 404 and body["data"] is None and body["error"]["code"] == "not_found"
    assert body["meta"]["snapshot_id"] == SNAPSHOT_ID and body["meta"]["as_of"]
    assert r.headers["cache-control"] == "no-store"


def test_only_get_is_allowed(client):
    r = client.post(f"{API}/meta")
    assert r.status_code == 405 and r.json()["error"]["code"] == "method_not_allowed"


# ----------------------------------------------------------------- caching #

def test_responses_carry_the_snapshot_etag_and_weekly_cache_control(client):
    r = client.get(f"{API}/meta")
    assert r.headers["etag"] == f'"{SNAPSHOT_ID}"'
    assert r.headers["cache-control"] == "public, max-age=3600, stale-while-revalidate=86400"


@pytest.mark.parametrize("header", [f'"{SNAPSHOT_ID}"', f'W/"{SNAPSHOT_ID}"', f'"other", "{SNAPSHOT_ID}"', "*"])
def test_a_matching_if_none_match_gets_304_with_no_body(client, header):
    r = client.get(f"{API}/meta", headers={"If-None-Match": header})
    assert r.status_code == 304 and r.content == b"" and r.headers["etag"] == f'"{SNAPSHOT_ID}"'


def test_an_older_etag_gets_the_full_response(client):
    r = client.get(f"{API}/meta", headers={"If-None-Match": '"data-2026-10-25"'})
    assert r.status_code == 200 and r.json()["data"]["snapshot_id"] == SNAPSHOT_ID


# -------------------------------------------------------------------- CORS #

def cors_client(snapshot_dir, origins):
    return TestClient(create_app(Settings(local_snapshot_path=snapshot_dir, cors_allow_origins=origins)))


def test_cors_allows_only_listed_origins(snapshot_dir):
    with cors_client(snapshot_dir, ("https://site.example",)) as c:
        ok = c.get(f"{API}/meta", headers={"Origin": "https://site.example"})
        other = c.get(f"{API}/meta", headers={"Origin": "https://evil.example"})
        cached = c.get(f"{API}/meta", headers={"Origin": "https://site.example", "If-None-Match": f'"{SNAPSHOT_ID}"'})
    assert ok.headers["access-control-allow-origin"] == "https://site.example"
    assert "etag" in ok.headers["access-control-expose-headers"].lower()
    assert "access-control-allow-origin" not in other.headers
    assert cached.status_code == 304 and cached.headers["access-control-allow-origin"] == "https://site.example"


def test_no_cors_headers_when_no_origins_are_configured(client):
    r = client.get(f"{API}/meta", headers={"Origin": "https://site.example"})
    assert "access-control-allow-origin" not in r.headers


def test_cors_preflight_allows_get_only(snapshot_dir):
    with cors_client(snapshot_dir, ("https://site.example",)) as c:
        get = c.options(f"{API}/meta", headers={"Origin": "https://site.example", "Access-Control-Request-Method": "GET"})
        post = c.options(f"{API}/meta", headers={"Origin": "https://site.example", "Access-Control-Request-Method": "POST"})
    assert get.status_code == 200 and post.status_code == 400
