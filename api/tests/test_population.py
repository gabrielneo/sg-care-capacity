"""/api/v1/population: residents and the share aged 65+, by year."""
API = "/api/v1/population"


def test_sums_the_planning_areas_for_each_year(client):
    body = client.get(API).json()
    assert body["data"] == [{"year": 2026, "reference_date": "2026-06-30", "residents_total": 276000,
                             "residents_65plus": 61000, "share_65plus": round(61000 / 276000, 6), "planning_areas": 2,
                             "planning_areas_with_figures": 2}]
    meta = body["meta"]
    assert meta["as_of"].startswith("2026-06-30") and [s["id"] for s in meta["sources"]] == ["singstat_residents"]
    assert meta["coverage"] == {"years": 1}


def test_one_year_says_no_trend_can_be_shown(client):
    caveats = client.get(API).json()["meta"]["caveats"]
    assert "Only one year is published here, so no trend can be shown." in caveats
    assert any("rounded to the nearest 10" in c for c in caveats)
