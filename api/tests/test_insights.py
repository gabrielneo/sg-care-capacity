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
    assert ids(body) == ["weekday-aaaaaaaaaa", "anomaly-bbbbbbbbbb", "volume_vs_wait-dddddddddd", "weekday-cccccccccc",
                         "access_gap-eeeeeeeeee"]
    first = body["data"][0]
    assert first["evidence"] == {"endpoint": "/api/v1/ed/daily?hospital=SGH", "query": "SELECT 1"}
    assert first["caveats"] and first["who_acts"] is None and first["action"] is None
    meta = body["meta"]
    assert meta["as_of"] == "2026-10-25" and meta["coverage"] == {"insights": 5, "in_release": 5}
    assert "A suggested action appears only after the author has reviewed it." in meta["caveats"]
    assert [s["id"] for s in meta["sources"]] == ["datagov_chas", "datagov_planning_areas", "moh_bed_waits", "moh_ed_attendances",
                                                "singstat_residents"]


@pytest.mark.parametrize("params, expected", [
    ({"type": "weekday"}, ["weekday-aaaaaaaaaa", "weekday-cccccccccc"]),
    ({"entity": "ah"}, ["weekday-cccccccccc"]),                              # case-insensitive
    ({"top": 1}, ["weekday-aaaaaaaaaa"]),
    ({"headline": "true"}, ["weekday-aaaaaaaaaa", "anomaly-bbbbbbbbbb", "volume_vs_wait-dddddddddd"]),   # in headline order
    ({"type": "trend"}, []),
    ({"type": "access_gap"}, ["access_gap-eeeeeeeeee"]),
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


def test_each_insight_carries_its_display_labels_and_chart(client):
    data = {r["insight_id"]: r for r in client.get(API, params={"headline": "true"}).json()["data"]}
    weekday = data["weekday-aaaaaaaaaa"]
    assert weekday["display"] == {"value_text": "5.0", "unit_text": "hours", "metric_label": "Average of daily median bed waits on Mondays",
                                  "comparison_label": "4.0 hours, its weekly average", "change": "up",
                                  "change_word": "higher than average"}
    chart = weekday["chart"]
    assert chart["kind"] == "bar" and [p["label"] for p in chart["points"]][:2] == ["Mon", "Tue"]
    assert chart["highlight"] == ["mon"] and chart["reference"] == {"value": 4.0, "label": "Weekly average"}
    assert chart["callout"] == "Mondays: 25% above average" and chart["trend_line"] is None
    volume = data["volume_vs_wait-dddddddddd"]
    assert volume["display"]["change"] is None and volume["display"]["unit_text"] is None
    assert volume["chart"]["x_label"] == "Days in five equal groups by ED visits vs usual"
    assert "Some insights have no chart data: this data release predates it." not in client.get(API).json()["meta"]["caveats"]


def test_a_release_from_before_charts_serves_its_insights_with_nulls(tmp_path):
    snap = build(tmp_path / "old", insight_charts=False)
    with TestClient(create_app(Settings(local_snapshot_path=snap))) as c:
        body = c.get(API).json()
    assert len(body["data"]) == 5 and all(r["display"] is None and r["chart"] is None for r in body["data"])
    assert "Some insights have no chart data: this data release predates it." in body["meta"]["caveats"]


def test_each_insight_names_the_sources_it_uses(client):
    # An access finding's data is from the clinic list (2024) and SingStat, not MOH (audit M-2).
    body = client.get("/api/v1/insights").json()
    by_type = {i["type"]: i["source_ids"] for i in body["data"]}
    assert by_type["access_gap"] == ["datagov_chas", "singstat_residents", "datagov_planning_areas"]
    for t in ("trend", "anomaly", "weekday"):
        if t in by_type:
            assert by_type[t] == ["moh_bed_waits"]
    listed = {s["id"]: s["as_of"] for s in body["meta"]["sources"]}
    for i in body["data"]:
        assert set(i["source_ids"]) <= set(listed)                 # each one's own as_of is in meta.sources


def test_a_findings_warnings_are_only_those_on_the_tables_it_uses(client):
    # An ED finding isn't affected by the clinic-coordinates check (audit L-7).
    body = client.get("/api/v1/insights", params={"type": "weekday"}).json()
    assert {w["table"] for w in body["meta"]["dq_warnings"]} <= {"moh_bed_waits"}
    assert all(i["dq_tables"] == ["moh_bed_waits"] for i in body["data"])
    access = client.get("/api/v1/insights", params={"type": "access_gap"}).json()
    assert {w["table"] for w in access["meta"]["dq_warnings"]} <= {"chas_clinics", "pop_65plus_by_area", "planning_area_boundaries"}
