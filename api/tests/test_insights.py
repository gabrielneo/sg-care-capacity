"""/api/v1/insights: the engine's published findings, with filters."""
import pytest
from fastapi.testclient import TestClient
from fixture_snapshot import build

from sg_health_api.config import Settings
from sg_health_api.main import create_app

API = "/api/v1/insights"


def ids(body) -> list[str]:
    return [r["insight_id"] for r in body["data"]]


def test_lists_published_insights_by_rank(client):
    body = client.get(API).json()
    assert ids(body) == ["weekday-aaaaaaaaaa", "anomaly-bbbbbbbbbb", "weekday-cccccccccc"]
    first = body["data"][0]
    assert first["evidence"] == {"endpoint": "/api/v1/ed/daily?hospital=SGH", "query": "SELECT 1"}
    assert first["caveats"] and first["who_acts"] is None and first["action"] is None
    meta = body["meta"]
    assert meta["as_of"] == "2026-10-25" and meta["coverage"] == {"insights": 3, "in_release": 3}
    assert "A suggested action appears only after the author has reviewed it." in meta["caveats"]
    assert [s["id"] for s in meta["sources"]] == ["moh_bed_waits"]


@pytest.mark.parametrize("params, expected", [
    ({"type": "weekday"}, ["weekday-aaaaaaaaaa", "weekday-cccccccccc"]),
    ({"entity": "ah"}, ["weekday-cccccccccc"]),                              # case-insensitive
    ({"top": 1}, ["weekday-aaaaaaaaaa"]),
    ({"headline": "true"}, ["weekday-aaaaaaaaaa", "anomaly-bbbbbbbbbb"]),     # in headline order
    ({"type": "trend"}, []),
])
def test_filters(client, params, expected):
    assert ids(client.get(API, params=params).json()) == expected


@pytest.mark.parametrize("params, field", [({"type": "magic"}, "type"), ({"top": 0}, "top"), ({"top": 101}, "top")])
def test_invalid_filters_are_400(client, params, field):
    r = client.get(API, params=params)
    assert r.status_code == 400 and r.json()["error"]["field"] == field


def test_a_release_from_before_the_engine_serves_an_empty_list(tmp_path):
    snap = build(tmp_path / "old", insights=False)
    with TestClient(create_app(Settings(local_snapshot_path=snap))) as c:
        body = c.get(API).json()
    assert body["data"] == [] and body["meta"]["coverage"] == {"insights": 0, "in_release": 0}
    assert any("before the insight engine" in note for note in body["meta"]["caveats"])
