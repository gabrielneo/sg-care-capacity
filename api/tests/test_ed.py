"""Hospitals and ED endpoints, checked as the site would use them."""
import pytest

API = "/api/v1"


def get(client, path, **params):
    r = client.get(f"{API}{path}", params=params)
    return r.status_code, r.json()


def error(client, path, **params):
    status, body = get(client, path, **params)
    assert status == 400 and body["data"] is None, body
    return body["error"]


# --------------------------------------------------------------- hospitals #

def test_hospitals_list_with_the_ucc_and_coverage_notes(client):
    status, body = get(client, "/hospitals")
    assert status == 200 and [h["hospital_code"] for h in body["data"]] == ["AH", "NUH", "SGH"]
    ah = body["data"][0]
    assert ah["facility_type"] == "UCC" and ah["reported_from"] is None
    assert any(c.startswith("AH: Urgent Care Centre") for c in body["meta"]["caveats"])
    assert body["meta"]["as_of"] == "2026-11-06"


# -------------------------------------------------------------------- daily #

def test_daily_defaults_to_the_90_days_up_to_the_latest_published_day(client):
    status, body = get(client, "/ed/daily")
    cov = body["meta"]["coverage"]
    assert status == 200 and (cov["from"], cov["to"]) == ("2026-08-03", "2026-10-31") and cov["rows"] == 138
    assert body["data"][-1]["report_date"] == "2026-10-31"
    assert body["meta"]["as_of"] == "2026-10-31" and {s["id"] for s in body["meta"]["sources"]} == {
        "moh_bed_waits", "moh_ed_attendances"}


def test_daily_for_one_hospital_and_range_keeps_missing_values_missing(client):
    status, body = get(client, "/ed/daily", hospital="ah", **{"from": "2026-10-06", "to": "2026-10-08"})
    days = {d["report_date"]: d for d in body["data"]}
    assert status == 200 and set(days) == {"2026-10-06", "2026-10-07", "2026-10-08"}
    gap = days["2026-10-07"]
    assert gap["attendances"] is None and gap["attendance_source_url"] is None   # never 0, never filled in
    assert gap["median_wait_hours"] == 2.0 and gap["is_complete_week"] is False
    assert set(body["meta"]["coverage"]["hospitals"]) == {"AH"}


def test_daily_rows_carry_their_dq_flags_and_the_warnings_for_moh_tables_only(client):
    _, body = get(client, "/ed/daily", hospital="SGH", **{"from": "2026-10-20", "to": "2026-10-20"})
    assert body["data"][0]["dq_flags"] == ["range.bed_wait_over_24h"]
    assert [w["check_id"] for w in body["meta"]["dq_warnings"]] == ["range.bed_wait_over_24h"]


def test_a_hospital_with_no_rows_returns_an_empty_list_not_zeros(client):
    status, body = get(client, "/ed/daily", hospital="NUH")
    assert status == 200 and body["data"] == [] and body["meta"]["coverage"]["hospitals"] == {"NUH": None}


@pytest.mark.parametrize("hospital", ["XYZ", "SGH' OR '1'='1", "SGH;DROP TABLE x"])
def test_unknown_hospitals_are_refused_with_the_valid_codes(client, hospital):
    err = error(client, "/ed/daily", hospital=hospital)
    assert err["code"] == "unknown_hospital" and err["field"] == "hospital" and "AH, NUH, SGH" in err["message"]


def test_exactly_two_years_is_allowed_and_one_day_more_is_not(client):
    assert get(client, "/ed/daily", **{"from": "2024-11-01", "to": "2026-10-31"})[0] == 200
    err = error(client, "/ed/daily", **{"from": "2024-11-01", "to": "2026-11-01"})
    assert err["code"] == "range_too_long" and err["field"] == "to"


def test_from_after_to_is_refused(client):
    err = error(client, "/ed/daily", **{"from": "2026-10-10", "to": "2026-10-01"})
    assert err["code"] == "invalid_range" and err["field"] == "from"
    err = error(client, "/ed/daily", **{"from": "2026-12-01"})                   # to defaults to the latest day
    assert "to defaults to the latest published day, 2026-10-31" in err["message"]


@pytest.mark.parametrize("param, value", [("from", "2026-13-01"), ("to", "yesterday"), ("from", "01/10/2026")])
def test_malformed_dates_are_refused(client, param, value):
    err = error(client, "/ed/daily", **{param: value})
    assert err["code"] == "invalid_parameter" and err["field"] == param and value in err["message"]


# ------------------------------------------------------------------- weekly #

def test_weekly_returns_the_latest_n_iso_weeks_with_day_counts(client):
    _, body = get(client, "/ed/weekly", hospital="SGH", weeks=2)
    weeks = body["data"]
    assert [(w["week_start"], w["days_reported_attendances"], w["is_complete_week"]) for w in weeks] == [
        ("2026-10-19", 7, True), ("2026-10-26", 6, False)]                     # the newest week is partial
    assert body["meta"]["coverage"]["incomplete_weeks"] == 1
    assert any("partial week is an undercount" in c for c in body["meta"]["caveats"])
    assert any(c.startswith("Average of daily median") for c in body["meta"]["caveats"])


def test_weekly_defaults_to_12_weeks(client):
    _, body = get(client, "/ed/weekly")
    assert body["meta"]["coverage"]["weeks"] == 12 and len(body["data"]) == 20   # 10 weeks of data x 2 hospitals


@pytest.mark.parametrize("weeks", [0, 105, "four"])
def test_weeks_out_of_range_are_refused(client, weeks):
    err = error(client, "/ed/weekly", weeks=weeks)
    assert err["code"] == "invalid_parameter" and err["field"] == "weeks"


# ------------------------------------------------------------------ summary #

def summary(client):
    status, body = get(client, "/ed/summary")
    assert status == 200
    return {s["hospital_code"]: s for s in body["data"]}, body["meta"]


def test_summary_compares_the_latest_complete_week_with_the_4_before_it(client):
    rows, meta = summary(client)
    sgh = rows["SGH"]
    assert sgh["latest_complete_week"]["week_start"] == "2026-10-19"                 # not the partial 26 Oct week
    assert sgh["baseline_weeks"] == ["2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"]
    assert sgh["mean_of_daily_median_wait_hours"] == {"unit": "hours", "latest": 5.0, "baseline_mean": 4.0,
                                                      "change": 1.0, "change_pct": 25.0}
    assert sgh["total_attendances"] == {"unit": "patients", "latest": 3150, "baseline_mean": 2800.0,
                                        "change": 350.0, "change_pct": 12.5}
    assert sgh["is_current"] and sgh["note"] is None
    assert meta["coverage"]["hospitals_with_a_baseline"] == 1 and meta["as_of"] == "2026-10-31"


def test_summary_gives_no_baseline_when_a_baseline_week_is_incomplete(client):
    ah = summary(client)[0]["AH"]
    assert ah["latest_complete_week"]["week_start"] == "2026-10-19" and ah["baseline_weeks"] == []
    assert ah["total_attendances"]["latest"] == 700 and ah["total_attendances"]["change"] is None
    assert "2026-10-05" in ah["note"]


def test_summary_keeps_a_hospital_with_no_data_as_missing(client):
    nuh = summary(client)[0]["NUH"]
    assert nuh["latest_complete_week"] is None and not nuh["is_current"]
    assert nuh["mean_of_daily_median_wait_hours"]["latest"] is None and "No complete week" in nuh["note"]
