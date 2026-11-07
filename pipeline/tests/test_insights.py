"""Insight engine on synthetic data: planted patterns are found, noise is not, and the gates hold."""
from __future__ import annotations

import json
from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from sg_health.insights import actions, engine, stats, wording
from sg_health.insights.detectors import access_gap, anomaly, weekday
from sg_health.insights.model import thresholds

LATEST = date(2026, 10, 19)             # a Monday: the latest complete ISO week
TODAY = date(2026, 10, 27)
MIN_C = 0.8


def hospitals(*codes: str) -> pd.DataFrame:
    names = {"SGH": "Singapore General Hospital", "CGH": "Changi General Hospital", "TTSH": "Tan Tock Seng Hospital"}
    return pd.DataFrame([{"hospital_code": c, "hospital_name": names.get(c, c), "cluster": "SingHealth",
                          "facility_type": "ED", "reported_from": None, "coverage_note": None} for c in codes])


def weekly(values: dict[str, list[float]], complete: bool = True) -> pd.DataFrame:
    rows = []
    for code, vals in values.items():
        n = len(vals)
        for k, v in enumerate(vals):
            start = LATEST - timedelta(weeks=n - 1 - k)
            rows.append({"hospital_code": code, "week_start": start, "week_end": start + timedelta(days=6),
                         "mean_of_daily_median_wait_hours": v, "total_attendances": 2800, "is_complete_week": complete})
    return pd.DataFrame(rows)


def daily(fn, codes=("SGH",), weeks: int = 26, seed: int = 0) -> pd.DataFrame:
    """fn(rng, code, day_index, weekday) -> (wait, visits)."""
    rng = np.random.default_rng(seed)
    first = LATEST - timedelta(weeks=weeks - 1)
    rows = []
    for code in codes:
        for i in range(weeks * 7):
            d = first + timedelta(days=i)
            wait, visits = fn(rng, code, i, d.weekday())
            rows.append({"hospital_code": code, "report_date": d, "median_wait_hours": wait, "attendances": visits,
                         "is_complete_week": True})
    return pd.DataFrame(rows)


def weekly_from(d: pd.DataFrame) -> pd.DataFrame:
    x = d.assign(week_start=pd.to_datetime(d["report_date"]).dt.to_period("W-SUN").dt.start_time.dt.date)
    g = x.groupby(["hospital_code", "week_start"]).agg(mean_of_daily_median_wait_hours=("median_wait_hours", "mean"),
                                                      total_attendances=("attendances", "sum")).reset_index()
    return g.assign(week_end=g["week_start"] + timedelta(days=6), is_complete_week=True)


EMPTY_AREAS = pd.DataFrame(columns=["planning_area", "residents_65plus", "cdmp_clinics", "cdmp_clinics_per_1k_seniors", "as_of"])
EMPTY_LIVE = pd.DataFrame(columns=["hospital_code", "is_adult_ed", "est_bed_wait_hours", "snapshot_at"])
NO_FAILS = pd.DataFrame(columns=["check_id", "table", "severity", "scope", "failing_rows", "blocks_publish"])


def inputs(w: pd.DataFrame, d: pd.DataFrame | None = None, h: pd.DataFrame | None = None, areas=None) -> dict:
    d = d if d is not None else pd.DataFrame(columns=["hospital_code", "report_date", "median_wait_hours", "attendances",
                                                      "is_complete_week"])
    return {"hospitals": h if h is not None else hospitals("SGH"), "weekly": w, "daily": d,
            "areas": areas if areas is not None else EMPTY_AREAS, "live": EMPTY_LIVE}


def published(result, kind: str) -> list[dict]:
    return [r for r in result.insights if r["type"] == kind]


# --------------------------------------------------------------------------- #
# trend
# --------------------------------------------------------------------------- #

def test_a_planted_upward_trend_is_found():
    rng = np.random.default_rng(1)
    vals = [4 + 0.15 * k + rng.normal(0, 0.3) for k in range(26)]
    result = engine.run(inputs(weekly({"SGH": vals})), NO_FAILS, TODAY)
    [ins] = published(result, "trend")
    assert ins["direction"] == "worse" and ins["metric_value"] == pytest.approx(0.15, abs=0.05)
    assert ins["p_adjusted"] < 0.05
    assert ins["headline"].startswith("Bed waits at Singapore General Hospital have risen about 0.1 hours a week")


def test_a_flat_series_yields_no_trend_insight():
    vals = [4 + (0.3 if k % 2 else -0.3) for k in range(26)]            # level, with noise but no direction
    result = engine.run(inputs(weekly({"SGH": vals})), NO_FAILS, TODAY)
    assert published(result, "trend") == []
    [c] = [c for c in result.candidates if c.type == "trend"]
    assert c.reason != "published"


def test_too_few_complete_weeks_is_skipped_not_guessed():
    w = weekly({"SGH": [4.0] * 26})
    w.loc[w.index[:10], "is_complete_week"] = False                    # 16 complete of 26: below 80%
    result = engine.run(inputs(w), NO_FAILS, TODAY)
    assert [s.reason for s in result.skips if s.type == "trend"] == ["16 of 26 weeks complete (62%), below 80%"]


def test_autocorrelation_correction_widens_the_p_value():
    rng = np.random.default_rng(3)
    e = [0.0]
    for _ in range(39):
        e.append(0.8 * e[-1] + rng.normal(0, 1))                       # AR(1), phi = 0.8
    y = np.array(e) + 0.05 * np.arange(40)
    mk = stats.mann_kendall(y)
    assert mk.lag1 > 0.3 and mk.n_eff_ratio > 1.5
    assert mk.p_value > mk.p_value_plain


# --------------------------------------------------------------------------- #
# anomaly
# --------------------------------------------------------------------------- #

def test_a_planted_spike_is_an_anomaly():
    vals = [4.0, 4.2, 3.9, 4.1, 4.0, 4.3, 3.8, 4.1, 9.0]
    out = anomaly.detect(weekly({"SGH": vals}), hospitals("SGH"), thresholds()["anomaly"], MIN_C, 7.0)
    [c] = out.candidates
    assert c.passes_effect and c.direction == "worse" and c.effect_size > 3.5


def test_no_variation_before_is_skipped():
    out = anomaly.detect(weekly({"SGH": [4.0] * 8 + [6.0]}), hospitals("SGH"), thresholds()["anomaly"], MIN_C, 7.0)
    assert out.candidates == [] and "MAD is 0" in out.skips[0].reason


# --------------------------------------------------------------------------- #
# weekday
# --------------------------------------------------------------------------- #

def test_random_noise_yields_no_weekday_insight():
    d = daily(lambda rng, c, i, wd: (4 + rng.normal(0, 0.5), 400), codes=("SGH", "CGH"), seed=7)
    result = engine.run(inputs(weekly_from(d), d, hospitals("SGH", "CGH")), NO_FAILS, TODAY)
    assert published(result, "weekday") == []


def test_a_planted_monday_peak_is_found():
    d = daily(lambda rng, c, i, wd: (4 + (2.0 if wd == 0 else 0) + rng.normal(0, 0.4), 400), codes=("SGH", "CGH"), seed=2)
    result = engine.run(inputs(weekly_from(d), d, hospitals("SGH", "CGH")), NO_FAILS, TODAY)
    rows = {r["entity"]: r for r in published(result, "weekday")}
    assert set(rows) == {"SGH", "CGH", "All hospitals"}
    assert "longest on Mondays" in rows["SGH"]["headline"]
    assert rows["All hospitals"]["headline"].startswith("Across all hospitals, bed waits are longest on Mondays")


def test_weekday_needs_12_complete_weeks():
    d = daily(lambda rng, c, i, wd: (4.0, 400), weeks=10)
    out = weekday.detect(d, weekly_from(d), hospitals("SGH"), thresholds()["weekday"], 0.0, 0.14)
    assert out.candidates == [] and "needs 12" in out.skips[0].reason


# --------------------------------------------------------------------------- #
# multiple testing
# --------------------------------------------------------------------------- #

def test_correction_removes_a_borderline_p_value():
    raw = [0.04] + [0.5] * 19
    adjusted = stats.benjamini_hochberg(raw)
    assert raw[0] < 0.05 <= adjusted[0]


def test_the_engine_applies_one_correction_across_detectors():
    d = daily(lambda rng, c, i, wd: (4 + (2.0 if wd == 0 else 0) + rng.normal(0, 0.4), 400 + rng.normal(0, 20)), seed=4)
    result = engine.run(inputs(weekly_from(d), d), NO_FAILS, TODAY)
    tested = [c for c in result.candidates if c.p_value is not None]
    assert {c.type for c in tested} >= {"trend", "weekday", "volume_vs_wait"} and result.tests == len(tested)
    assert all(c.p_adjusted is not None and c.p_adjusted >= c.p_value for c in tested)


# --------------------------------------------------------------------------- #
# access_gap
# --------------------------------------------------------------------------- #

def areas_frame() -> pd.DataFrame:
    rows = [("Big Low", 20000, 5), ("Big High", 20000, 40), ("Mid", 8000, 8), ("Tiny", 900, 0), ("Empty", 0, 2)]
    return pd.DataFrame([{"planning_area": a, "residents_65plus": s, "cdmp_clinics": c,
                          "cdmp_clinics_per_1k_seniors": (1000 * c / s) if s else None, "as_of": pd.Timestamp("2024-06-06")}
                         for a, s, c in rows])


def test_an_area_under_1000_seniors_is_excluded_and_listed():
    out = access_gap.detect(areas_frame(), thresholds()["access_gap"], MIN_C)
    excluded = {e["area"]: e["reason"] for e in out.extra["excluded_areas"]}
    assert excluded == {"Tiny": "fewer than 1,000 residents aged 65+", "Empty": "no residents aged 65+"}
    assert "Tiny" not in {c.entity for c in out.candidates}


def test_access_gap_ranks_the_biggest_shortfall_first():
    out = access_gap.detect(areas_frame(), thresholds()["access_gap"], MIN_C)
    first = out.candidates[0]
    assert first.entity == "Big Low" and first.passes_effect
    national = 55 / 48900                                                 # all clinics / all seniors
    assert first.values["shortfall"] == f"{round(20000 * national - 5):,d}"
    assert not next(c for c in out.candidates if c.entity == "Big High").passes_effect   # no shortfall


# --------------------------------------------------------------------------- #
# gates and logging
# --------------------------------------------------------------------------- #

def test_a_blocking_check_on_an_input_table_skips_the_detector():
    failed = pd.DataFrame([{"check_id": "unit.file_vs_stored", "table": "moh_bed_waits", "severity": "ERROR",
                            "scope": "file", "failing_rows": 1, "blocks_publish": True}])
    rng = np.random.default_rng(1)
    result = engine.run(inputs(weekly({"SGH": [4 + 0.15 * k + rng.normal(0, 0.3) for k in range(26)]})), failed, TODAY)
    assert published(result, "trend") == []
    assert any(s.type == "trend" and "blocks publishing" in s.reason for s in result.skips)


def test_quarantined_rows_become_a_caveat_not_a_skip():
    failed = pd.DataFrame([{"check_id": "clinic.coordinates_in_singapore", "table": "chas_clinics", "severity": "ERROR",
                            "scope": "row", "failing_rows": 1, "blocks_publish": False}])
    result = engine.run(inputs(weekly({"SGH": [4.0] * 26}), areas=areas_frame()), failed, TODAY)
    [gap] = published(result, "access_gap")
    assert "1 record in the CHAS clinic list was set aside by data checks." in gap["caveats"]


def test_skips_are_logged_to_dq_results(tmp_path):
    from sg_health.warehouse import Warehouse
    wh = Warehouse(tmp_path / "w.duckdb")
    try:
        from sg_health.insights.model import Skip
        engine.log_skips(wh, "run-1", [Skip("trend", "SGH", "16 of 26 weeks complete"), Skip("regional", "all", "not approved")])
        rows = wh.query("SELECT check_id, status, severity, details, blocks_publish FROM dq_results ORDER BY check_id")
    finally:
        wh.close()
    assert rows.to_dict("records") == [
        {"check_id": "insight.regional.all", "status": "skipped", "severity": "WARN", "details": "not approved", "blocks_publish": False},
        {"check_id": "insight.trend.sgh", "status": "skipped", "severity": "WARN", "details": "16 of 26 weeks complete",
         "blocks_publish": False}]


# --------------------------------------------------------------------------- #
# wording and actions
# --------------------------------------------------------------------------- #

def test_no_headline_contains_a_banned_causal_word():
    d = daily(lambda rng, c, i, wd: (4 + 0.02 * i + (2.0 if wd == 0 else 0) + rng.normal(0, 0.4),
                                     400 + 30 * (wd == 0) + rng.normal(0, 20)), codes=("SGH", "CGH"), seed=5)
    result = engine.run(inputs(weekly_from(d), d, hospitals("SGH", "CGH"), areas_frame()), NO_FAILS, TODAY)
    assert {r["type"] for r in result.insights} >= {"trend", "weekday", "access_gap"}
    for r in result.insights:
        for text in (r["headline"], r["detail"], *r["caveats"], r["action"] or ""):
            assert not wording.CAUSAL.search(text), text
        assert len(r["headline"].split()) <= 20 and len(wording.sentences(r["detail"])) <= 2


@pytest.mark.parametrize("bad", ["Long visits cause long waits.", "Visits drive waits.", "This leads to delays.",
                                 "Waits rose because of flu."])
def test_the_wording_check_rejects_causal_words(bad):
    with pytest.raises(wording.WordingError, match="causal"):
        wording.check(bad, kind="headline")


def test_templates_contain_no_causal_words():
    for detector, variants in wording.templates().items():
        for variant, t in variants.items():
            for text in t.values():
                assert not wording.CAUSAL.search(text), (detector, variant, text)


def test_the_wording_check_rejects_column_names_and_long_headlines():
    with pytest.raises(wording.WordingError, match="column"):
        wording.check("The median_wait_hours rose.", kind="headline", forbidden=frozenset({"median_wait_hours"}))
    with pytest.raises(wording.WordingError, match="over 20 words"):
        wording.check(" ".join(["word"] * 21) + ".", kind="headline")


def test_rounding_and_plurals():
    assert wording.hours(1.04) == "1.0 hour" and wording.hours(4.26) == "4.3 hours"
    assert wording.percent(12.6) == "13%" and wording.count(1234.4) == "1,234"
    assert wording.fill("{n} {n|area|areas}", {"n": 1}) == "1 area"
    assert wording.fill("{n} {n|area|areas}", {"n": 3}) == "3 areas"


def test_unreviewed_actions_are_not_published(monkeypatch):
    entry = {"detectors": {"trend": {"reviewed": False, "by_direction": {"worse": {"who_acts": "{cluster} teams",
                                                                                   "action": "Review {hospital}."}}}}}
    monkeypatch.setattr(actions, "_load", lambda: entry)
    assert actions.action_for("trend", "worse", {"cluster": "SingHealth", "hospital": "SGH"}) == (None, None, actions.PENDING)
    entry["detectors"]["trend"]["reviewed"] = True
    assert actions.action_for("trend", "worse", {"cluster": "SingHealth", "hospital": "SGH"})[:2] == ("SingHealth teams", "Review SGH.")
    entry["detectors"]["trend"]["by_direction"]["worse"]["action"] = "Flu drives this."
    assert actions.action_for("trend", "worse", {"cluster": "SingHealth", "hospital": "SGH"})[:2] == (None, None)


def test_the_real_actions_file_is_respected():
    """No entry is reviewed yet (or the file is empty in this checkout), so no action is published."""
    rng = np.random.default_rng(1)
    result = engine.run(inputs(weekly({"SGH": [4 + 0.15 * k + rng.normal(0, 0.3) for k in range(26)]})), NO_FAILS, TODAY)
    [ins] = published(result, "trend")
    assert ins["who_acts"] is None and ins["action"] is None
    assert any(c in ins["caveats"] for c in (actions.PENDING, "No suggested action for this finding."))


# --------------------------------------------------------------------------- #
# ranking and determinism
# --------------------------------------------------------------------------- #

def test_headline_findings_take_at_most_one_per_detector():
    d = daily(lambda rng, c, i, wd: (4 + 0.02 * i + (2.0 if wd == 0 else 0) + rng.normal(0, 0.4),
                                     400 + rng.normal(0, 20)), codes=("SGH", "CGH", "TTSH"), seed=6)
    result = engine.run(inputs(weekly_from(d), d, hospitals("SGH", "CGH", "TTSH"), areas_frame()), NO_FAILS, TODAY)
    heads = sorted((r for r in result.insights if r["headline_rank"]), key=lambda r: r["headline_rank"])
    assert [r["headline_rank"] for r in heads] == list(range(1, len(heads) + 1)) and len(heads) <= 3
    assert len({r["type"] for r in heads}) == len(heads)


def test_the_same_input_gives_the_same_output():
    d = daily(lambda rng, c, i, wd: (4 + (2.0 if wd == 0 else 0) + rng.normal(0, 0.4), 400), seed=8)
    a = engine.to_json(engine.run(inputs(weekly_from(d), d, areas=areas_frame()), NO_FAILS, TODAY))
    b = engine.to_json(engine.run(inputs(weekly_from(d), d, areas=areas_frame()), NO_FAILS, TODAY))
    assert json.dumps(a, sort_keys=True, default=str) == json.dumps(b, sort_keys=True, default=str)


def test_fct_insight_columns_are_in_the_data_dictionary():
    import re

    from sg_health import config
    doc = (config.REPO_ROOT / "docs" / "data_dictionary.md").read_text()
    section = re.search(r"^### `marts\.fct_insight`\n(.*?)(?=^##)", doc, re.S | re.M)
    assert section
    documented = set()
    for line in section.group(1).splitlines():
        if line.startswith("| `"):
            documented |= set(re.findall(r"`([a-z0-9_]+)`", line.split("|")[1]))
    assert documented == set(engine.COLUMNS)
