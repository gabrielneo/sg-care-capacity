"""Insight engine on synthetic data: planted patterns are found, noise is not, and the gates hold."""
from __future__ import annotations

import json
from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from sg_health.insights import actions, engine, stats, wording
from sg_health.insights.detectors import access_gap, anomaly, usual_gap, weekday
from sg_health.insights.model import thresholds

LATEST = date(2026, 10, 19)             # a Monday: the latest complete ISO week
TODAY = date(2026, 10, 27)
MIN_C = 0.8


def hospitals(*codes: str) -> pd.DataFrame:
    names = {"SGH": "Singapore General Hospital", "CGH": "Changi General Hospital", "TTSH": "Tan Tock Seng Hospital",
             "AH": "Alexandra Hospital (UCC)"}
    return pd.DataFrame([{"hospital_code": c, "hospital_name": names.get(c, c), "cluster": "SingHealth",
                          "facility_type": "UCC" if c == "AH" else "ED", "reported_from": None, "coverage_note": None}
                         for c in codes])


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
    national = 53 / 48000                                                 # clinics / seniors of the compared areas only
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


def test_a_set_aside_cdmp_clinic_is_named_in_access_caveats_without_guessing_its_area():
    # As on 2026-11-08: one CDMP clinic had coordinates (0, 0), so it counts in no area (audit M-4).
    failed = pd.DataFrame([{"check_id": "clinic.coordinates_in_singapore", "table": "chas_clinics", "severity": "ERROR",
                            "scope": "row", "failing_rows": 1, "blocks_publish": False}])
    ins = inputs(weekly({"SGH": [4.0] * 26}), areas=areas_frame())
    ins["set_aside_cdmp"] = pd.DataFrame([{"clinic_name": "DA clinic @ Taman Jurong", "postal_code": "610410",
                                           "check_ids": "clinic.coordinates_in_singapore"}])
    result = engine.run(ins, failed, TODAY)
    [gap] = published(result, "access_gap")
    assert ("1 CDMP clinic is not counted in any area: DA clinic @ Taman Jurong (postcode 610410; listed location "
            "outside Singapore).") in gap["caveats"]
    assert not any("Jurong West" in c for c in gap["caveats"])                  # its area is not guessed
    assert all("CDMP clinic" not in c for i in published(result, "trend") for c in i["caveats"])   # ED findings untouched


def test_the_set_aside_note_lists_three_clinics_then_a_count():
    clinics = pd.DataFrame([{"clinic_name": f"Clinic {i}", "postal_code": None, "check_ids": "x.other"} for i in range(5)])
    assert engine.set_aside_cdmp_note(clinics) == ("5 CDMP clinics are not counted in any area: Clinic 0 (failed a data "
                                                   "check); Clinic 1 (failed a data check); Clinic 2 (failed a data check); "
                                                   "and 2 more.")
    assert engine.set_aside_cdmp_note(clinics.head(0)) is None and engine.set_aside_cdmp_note(None) is None


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
            for text in (t.values() if isinstance(t, dict) else [t]):     # the evidence block is level -> sentence
                assert not wording.CAUSAL.search(text), (detector, variant, text)


def test_only_tested_evidence_sentences_and_details_speak_of_chance():
    t = wording.templates()
    assert set(t["evidence"]) == set(wording.EVIDENCE_LEVELS)
    assert not wording.PROBABILITY.search(t["evidence"]["observed"])
    for level in ("tested", "robust", "association-only"):
        assert "{chance}" in t["evidence"][level], level
    # Chance is said once, by the evidence sentence: never in a detector's own detail or headline.
    for detector, variants in t.items():
        if detector == "evidence":
            continue
        for variant, v in variants.items():
            for key in ("headline", "detail"):
                assert not wording.PROBABILITY.search(v[key]), (detector, variant, key)


def test_probability_wording_without_a_p_value_is_refused():
    with pytest.raises(wording.WordingError, match="probability"):
        wording.check_probability("A week this far out happens rarely by chance.", tested=False)
    wording.check_probability("Unlikely to be chance: the odds are less than 1 in 1,000.", tested=True)
    row = {"insight_id": "x", "type": "anomaly", "entity": "SGH", "period_start": date(2026, 10, 19),
           "period_end": date(2026, 10, 25), "as_of": date(2026, 10, 25), "strength": "strong", "evidence_level": "observed",
           "p_adjusted": None, "headline": "Bed waits at SGH were unusually long.", "detail": "This happens rarely by chance."}
    with pytest.raises(ValueError, match="probability"):
        engine.check_rows([row])


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


def _ucc_run():
    """AH (the urgent care centre) has by far the strongest weekday pattern; SGH and CGH a weaker one."""
    d = daily(lambda rng, c, i, wd: (2 + (6.0 if c == "AH" and wd == 0 else 1.0 if wd == 0 else 0) + rng.normal(0, 0.3),
                                     400 + rng.normal(0, 20)), codes=("AH", "SGH", "CGH"), seed=11)
    return engine.run(inputs(weekly_from(d), d, hospitals("AH", "SGH", "CGH"), areas_frame()), NO_FAILS, TODAY)


def test_an_urgent_care_finding_is_published_scoped_and_never_a_headline():
    result = _ucc_run()
    ah = [r for r in result.insights if r["entity"] == "AH"]
    assert ah, "the urgent care centre's own findings are still published"
    for r in ah:
        assert r["scope"] == "urgent_care" and r["headline_rank"] is None
        assert r["caveats"][0] == engine.SCOPE_CAVEAT
    assert all(r["scope"] == "system" for r in result.insights if r["entity"] != "AH")
    # It scores as high as a headline would need, yet the headlines are all system-wide findings.
    heads = [r for r in result.insights if r["headline_rank"]]
    assert heads and all(r["entity"] != "AH" for r in heads)
    assert max(r["rank_score"] for r in ah) >= min(r["rank_score"] for r in heads)


def test_the_pooled_weekday_finding_leaves_the_urgent_care_centre_out():
    result = _ucc_run()
    [pooled] = [c for c in result.candidates if c.type == "weekday" and c.variant == "pooled"]
    assert pooled.values["n_hospitals"] == 2
    assert pooled.n == 2 * 26 * 7


def test_headline_ranks_skip_urgent_care_rows():
    rows = [{"insight_id": "a", "type": "trend", "rank_score": 0.9, "effect_size": 1, "scope": "urgent_care"},
            {"insight_id": "b", "type": "trend", "rank_score": 0.5, "effect_size": 1, "scope": "system"},
            {"insight_id": "c", "type": "weekday", "rank_score": 0.4, "effect_size": 1, "scope": "system"}]
    from sg_health.insights import ranking
    assert ranking.headline_ranks(rows) == {"b": 1, "c": 2}


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


@pytest.mark.parametrize("detector", ["trend", "anomaly", "usual_gap", "weekday", "volume_vs_wait", "access_gap", "regional", "source_gap", "monthly_yoy"])
def test_every_detector_is_documented(detector):
    import re

    from sg_health import config
    doc = (config.REPO_ROOT / "docs" / "insights_method.md").read_text()
    section = re.search(rf"^## \d\. {detector}\n(.*?)(?=^## |\Z)", doc, re.S | re.M)
    assert section, f"{detector} has no section in docs/insights_method.md"
    for part in ("Question", "ethod", "Gate", "Why this method", "Limitations"):
        assert part in section.group(1), f"{detector}: missing {part}"
    assert detector in thresholds(), f"{detector} has no block in thresholds.yml"


# --------------------------------------------------------------------------- #
# chart and display: what the site draws, from the values each detector tested
# --------------------------------------------------------------------------- #

def busy_run():
    """Every ED detector fires: a trend, a Monday peak, a last-week spike, visits that move with waits."""
    def fn(rng, code, i, wd):
        visits = 400 + 40 * rng.normal()
        return 4 + 0.02 * i + (2.0 if wd == 0 else 0) + 0.02 * (visits - 400) + rng.normal(0, 0.3), visits
    d = daily(fn, codes=("SGH", "CGH"), seed=5)
    return engine.run(inputs(weekly_from(d), d, hospitals("SGH", "CGH"), areas_frame()), NO_FAILS, TODAY), d


def test_every_published_insight_has_a_chart_and_labels():
    result, _ = busy_run()
    assert {r["type"] for r in result.insights} >= {"trend", "weekday", "volume_vs_wait", "access_gap"}
    for r in result.insights:
        disp, ch = r["display"], r["chart"]
        assert disp["value_text"] and disp["metric_label"] and disp["change"] in (None, "up", "down")
        keys = [p["key"] for p in ch["points"]]
        assert ch["kind"] in ("bar", "line") and len(keys) >= 2 and set(ch["highlight"]) <= set(keys)
        assert ch["callout"] and ch["y_label"]
        for text in (disp["metric_label"], disp["comparison_label"], disp["change_word"], ch["callout"], ch["y_label"]):
            if text:
                assert not wording.CAUSAL.search(text) and len(text.split()) <= wording.MAX_LABEL_WORDS, text


def test_the_weekday_chart_is_the_tested_weekday_means():
    result, d = busy_run()
    sgh = next(r for r in published(result, "weekday") if r["entity"] == "SGH")
    rows = d[d["hospital_code"] == "SGH"]
    means = rows.groupby(pd.to_datetime(rows["report_date"]).dt.day_of_week)["median_wait_hours"].mean()
    bars = sgh["chart"]["points"]
    assert [p["label"] for p in bars] == ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    assert [p["value"] for p in bars] == pytest.approx(list(means), abs=1e-4)
    assert sgh["chart"]["highlight"] == ["mon"] and bars[0]["value"] == pytest.approx(sgh["metric_value"], abs=1e-4)
    assert sgh["chart"]["reference"] == {"value": pytest.approx(sgh["comparison_value"], abs=1e-4), "label": "Weekly average"}
    pct = sgh["headline"].split(", ")[-1].split("%")[0]                 # "... on Mondays, 49% above ..."
    assert sgh["chart"]["callout"] == f"Mondays: {pct}% above average"
    assert sgh["display"]["value_text"] == f"{sgh['metric_value']:.1f}" and sgh["display"]["unit_text"] == "hours"
    assert sgh["display"]["comparison_label"].endswith(", its weekly average") and sgh["display"]["change"] == "up"
    assert sgh["evidence"]["endpoint"] == "/api/v1/ed/daily?hospital=SGH&from=2026-04-27&to=2026-10-25"


def test_the_anomaly_chart_shows_the_week_against_the_usual_level():
    vals = [4.0, 4.2, 3.9, 4.1, 4.0, 4.3, 3.8, 4.1, 9.0]
    [c] = anomaly.detect(weekly({"SGH": vals}), hospitals("SGH"), thresholds()["anomaly"], MIN_C, 7.0).candidates
    assert [p["value"] for p in c.chart["points"]] == vals and c.chart["highlight"] == [LATEST.isoformat()]
    assert c.chart["points"][-1]["label"] == "19 Oct" and c.chart["reference"] == {"value": 4.05, "label": "Usual level"}
    assert c.display == {"value_text": "9.0", "unit_text": "hours", "change": "up"}
    assert c.caveats[0] == "One unusual week is not a trend."         # the step's caveat chip shows the first


def test_a_missing_week_is_a_gap_in_the_trend_chart_not_a_zero():
    rng = np.random.default_rng(1)
    w = weekly({"SGH": [4 + 0.15 * k + rng.normal(0, 0.3) for k in range(26)]})
    w.loc[w.index[5], "is_complete_week"] = False
    result = engine.run(inputs(w), NO_FAILS, TODAY)
    [ins] = published(result, "trend")
    points = ins["chart"]["points"]
    assert len(points) == 26 and points[5]["value"] is None and all(p["value"] is not None for p in points[6:])
    line = ins["chart"]["trend_line"]
    assert line["last"] > line["first"] and ins["display"]["change"] == "up" and ins["display"]["change_word"] == "rising"
    assert ins["display"]["comparison_label"] is None                  # a slope and a level aren't the same unit


def test_the_volume_chart_groups_days_into_fifths():
    result, _ = busy_run()
    ins = next(r for r in published(result, "volume_vs_wait") if r["entity"] == "SGH")
    bars = ins["chart"]["points"]
    assert [p["label"] for p in bars] == ["Quietest", "Quieter", "Middle", "Busier", "Busiest"]
    assert bars[-1]["value"] > bars[0]["value"] and ins["chart"]["highlight"] == ["q5"]
    assert ins["chart"]["reference"] == {"value": 0.0, "label": "Usual for that weekday"}
    assert ins["chart"]["callout"].endswith("longer than after the quietest") or "longer than on the quietest" in ins["chart"]["callout"]
    assert ins["display"]["change"] is None and ins["display"]["change_word"].endswith(" link")


def test_the_access_gap_chart_compares_the_area_with_singapore():
    out = access_gap.detect(areas_frame(), thresholds()["access_gap"], MIN_C)
    first = out.candidates[0]
    assert [p["label"] for p in first.chart["points"]] == ["Big Low", "Singapore overall"]
    assert first.chart["points"][1]["value"] == pytest.approx(1000 * 53 / 48000, abs=1e-4)
    assert first.display["change"] == "down"


@pytest.mark.parametrize("points, highlight", [
    ([{"key": "a", "label": "A", "value": 1.0}], ["a"]),                                                  # one point
    ([{"key": "a", "label": "A", "value": 1.0}, {"key": "b", "label": "B", "value": 2.0}], ["c"]),      # unknown key
    ([{"key": "a", "label": "A", "value": 1.0}, {"key": "a", "label": "B", "value": 2.0}], ["a"]),      # duplicate key
])
def test_a_chart_without_a_valid_highlight_is_refused(points, highlight):
    from sg_health.insights.model import chart
    with pytest.raises(ValueError):
        chart("bar", "Hours", points, highlight)


@pytest.mark.parametrize("bad", ["Busy days cause long waits", "a label that is far too long to sit beside a number on the page",
                                 "Not a phrase."])
def test_the_label_check_rejects_causal_long_and_sentence_labels(bad):
    with pytest.raises(wording.WordingError):
        wording.check(bad, kind="label")


def test_every_template_variant_has_a_metric_label_and_a_callout():
    for detector, variants in wording.templates().items():
        if detector == "evidence":
            continue
        for variant, t in variants.items():
            assert t.get("metric_label") and t.get("callout"), f"{detector}.{variant}"
            for key in wording.DISPLAY_FIELDS:
                if key in t:
                    assert not wording.CAUSAL.search(t[key]), f"{detector}.{variant}.{key}"


def test_display_and_chart_round_trip_through_fct_insight(tmp_path):
    from sg_health.warehouse import Warehouse
    result, _ = busy_run()
    wh = Warehouse(tmp_path / "w.duckdb")
    try:
        engine.write_mart(wh, result)
        rows = wh.con.execute("SELECT insight_id, display, chart FROM marts.fct_insight ORDER BY insight_id").fetchall()
    finally:
        wh.close()
    by_id = {r["insight_id"]: r for r in result.insights}
    assert len(rows) == len(by_id)
    for insight_id, disp, ch in rows:
        assert disp == by_id[insight_id]["display"] and ch == by_id[insight_id]["chart"]
    assert json.loads(json.dumps(engine.to_json(result)))["headline_findings"][0]["chart"]["points"]


def test_the_p_value_is_written_as_plain_odds():
    assert [wording.chance_text(p) for p in (0.0002, 0.004, 0.03, 0.0495)] == [
        "less than 1 in 1,000", "about 4 in 1,000", "about 3 in 100", "about 5 in 100"]
    d = daily(lambda rng, c, i, wd: (4 + (2.0 if wd == 0 else 0) + rng.normal(0, 0.4), 400), codes=("SGH", "CGH"), seed=2)
    result = engine.run(inputs(weekly_from(d), d, hospitals("SGH", "CGH")), NO_FAILS, TODAY)
    detail = next(r for r in published(result, "weekday") if r["entity"] == "SGH")["detail"]
    # A strong Monday peak: tested, and its 95% range excludes the weekly average, so robust.
    assert detail.endswith("A test says this is unlikely to be chance (odds less than 1 in 1,000, allowing for every test run), "
                           "and its 95% range excludes no difference.")
    assert "adjusted p" not in detail


def test_the_api_reads_the_same_tables_per_detector_as_the_engine():
    # The API attaches each finding's data-quality warnings by these tables (audit L-7).
    import ast

    from sg_health import config
    tree = ast.parse((config.REPO_ROOT / "api" / "sg_health_api" / "routes" / "insights.py").read_text())
    node = next(n for n in tree.body if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "TABLES_BY_TYPE")
    assert ast.literal_eval(node.value) == engine.INPUT_TABLES


# --------------------------------------------------------------------------- #
# callouts: usual_gap, period, strength, and the weeks with nothing to say
# --------------------------------------------------------------------------- #

USUAL = [4.0, 4.2, 3.9, 4.1, 4.0, 4.3, 3.8, 4.1]          # median 4.05


def test_a_week_30_percent_above_usual_is_a_finding():
    [c] = usual_gap.detect(weekly({"SGH": [*USUAL, 5.4]}), hospitals("SGH"), thresholds()["usual_gap"], MIN_C, 0.6).candidates
    assert c.passes_effect and c.p_value is None and c.comparison_value == pytest.approx(4.05)
    assert c.values["pct"] == "33%" and c.values["usual"] == "4.0 hours"
    assert c.period == (LATEST, LATEST + timedelta(days=6))


def test_a_week_just_under_the_30_percent_line_is_not_published():
    result = engine.run(inputs(weekly({"SGH": [*USUAL, 5.2]})), NO_FAILS, TODAY)     # +28%
    assert published(result, "usual_gap") == []


def test_a_quiet_week_has_no_findings_and_no_callouts():
    result = engine.run(inputs(weekly({"SGH": [*USUAL, 4.1]})), NO_FAILS, TODAY)
    assert result.insights == []                                       # missing evidence means no sentence


def test_usual_gap_needs_all_eight_weeks_before():
    out = usual_gap.detect(weekly({"SGH": [4.0] * 5 + [9.0]}), hospitals("SGH"), thresholds()["usual_gap"], MIN_C, 0.6)
    assert out.candidates == [] and "needs the latest week and all 8 weeks" in out.skips[0].reason


def test_usual_gap_wording_matches_the_plan():
    result = engine.run(inputs(weekly({"SGH": [*USUAL, 6.075]})), NO_FAILS, TODAY)    # +50%
    [r] = published(result, "usual_gap")
    assert r["headline"] == ("Singapore General Hospital: bed wait 6.1 hours, 50% above its usual 4.0 hours "
                             "(week of 19–25 Oct 2026).")
    assert r["chart"]["callout"] == "19–25 Oct 2026: 50% above usual" and r["display"]["change_word"] == "higher than usual"
    assert r["strength"] == "strong" and r["p_value"] is None


def test_every_published_insight_has_a_period_and_a_strength():
    result, _ = busy_run()
    for r in result.insights:
        assert r["strength"] in ("negligible", "weak", "moderate", "strong")
        assert r["period_start"] <= r["period_end"], r["type"]
    by_type = {r["type"]: r for r in result.insights}
    assert (by_type["trend"]["period_start"], by_type["trend"]["period_end"]) == (date(2026, 4, 27), date(2026, 10, 25))
    assert by_type["access_gap"]["period_start"] == by_type["access_gap"]["period_end"] == by_type["access_gap"]["as_of"]


@pytest.mark.parametrize("norm, label", [(0.05, "negligible"), (0.2, "weak"), (0.4, "moderate"), (0.9, "strong")])
def test_strength_labels(norm, label):
    assert engine.strength_label(norm) == label


@pytest.mark.parametrize("bad", ["Waits are long due to flu.", "Waits were caused by flu.", "Due to flu, waits rose."])
def test_due_to_and_caused_are_banned(bad):
    with pytest.raises(wording.WordingError, match="causal"):
        wording.check(bad, kind="label")


def test_association_findings_say_they_do_not_show_why():
    result, _ = busy_run()
    for r in published(result, "volume_vs_wait"):
        assert "association" in r["detail"] and r["caveats"][0] == "This is an association only; it does not show why waits move."


def test_no_callout_or_label_says_due_to_or_caused():
    result, _ = busy_run()
    for r in result.insights:
        for text in (r["headline"], r["detail"], r["chart"]["callout"], *r["caveats"]):
            assert "due to" not in text.lower() and "caused" not in text.lower(), text


def test_period_and_strength_columns_are_written_to_the_mart(tmp_path):
    from sg_health.warehouse import Warehouse
    result, _ = busy_run()
    wh = Warehouse(tmp_path / "w.duckdb")
    engine.write_mart(wh, result)
    n_bad = wh.con.execute("SELECT count(*) FROM marts.fct_insight WHERE period_start IS NULL OR period_end IS NULL "
                           "OR period_end < period_start OR strength NOT IN ('negligible','weak','moderate','strong')").fetchone()[0]
    assert n_bad == 0


@pytest.mark.parametrize("change", [{"period_end": date(2020, 1, 1)}, {"strength": "huge"}, {"period_start": None},
                                    {"period_end": date(2030, 1, 1)}])
def test_a_finding_with_a_bad_period_or_strength_stops_the_build(change):
    result, _ = busy_run()
    row = {**result.insights[0], **change}
    with pytest.raises(ValueError):
        engine.check_rows([row])


# --------------------------------------------------------------------------- #
# freshness (docs/datasets.yml, shared with the site)
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize("source, as_of, today, expected", [
    ("moh_bed_waits", date(2026, 10, 31), date(2026, 11, 10), "up_to_date"),     # 10 days
    ("moh_bed_waits", date(2026, 10, 31), date(2026, 11, 11), "due"),
    ("moh_bed_waits", date(2026, 10, 31), date(2026, 11, 21), "due"),            # 21 days
    ("moh_bed_waits", date(2026, 10, 31), date(2026, 11, 22), "overdue"),
    ("datagov_chas", date(2024, 6, 6), date(2025, 6, 6), "up_to_date"),          # 12 calendar months
    ("datagov_chas", date(2024, 6, 6), date(2025, 6, 7), "due"),
    ("datagov_chas", date(2024, 6, 6), date(2026, 11, 14), "overdue"),
    ("singstat_residents", date(2026, 6, 30), date(2027, 9, 30), "up_to_date"),  # 15 months
    ("singstat_residents", date(2026, 6, 30), date(2027, 10, 1), "due"),
    ("nuhs_live", date(2026, 11, 8), date(2026, 11, 16), "overdue"),
])
def test_freshness_levels_from_the_shared_config(source, as_of, today, expected):
    from sg_health import freshness
    assert freshness.level(source, as_of, today) == expected


def test_freshness_months_are_calendar_months_and_findings_inherit():
    from sg_health import freshness
    assert freshness.add_span(date(2026, 1, 31), {"months": 1}) == date(2026, 2, 28)
    assert freshness.worst(["up_to_date", "overdue", "due"]) == "overdue"
    assert freshness.datasets()["insight_findings"]["inherits"] is True
    with pytest.raises(ValueError):
        freshness.level("insight_findings", date(2026, 11, 1), date(2026, 11, 2))


def test_every_source_the_api_cites_has_a_freshness_rule():
    import re

    from sg_health import config as cfg
    from sg_health import freshness
    route = (cfg.REPO_ROOT / "api" / "sg_health_api" / "routes" / "insights.py").read_text()
    block = route[route.index("SOURCES_BY_TYPE = {"):route.index("TABLES_BY_TYPE")]
    cited = set(re.findall(r'"((?:moh|nuhs|datagov|singstat)_[a-z_]+)"', block))
    assert cited and cited <= set(freshness.datasets())
    for k, ds in freshness.datasets().items():
        assert ds.get("inherits") or {"due_after", "overdue_after"} <= set(ds), k


# --------------------------------------------------------------------------- #
# B1-B3: evidence levels, shared peaks, n and confidence intervals
# --------------------------------------------------------------------------- #

def _weekday_run(tue: float, wed: float, seed: int = 4):
    d = daily(lambda rng, c, i, wd: (8 + (tue if wd == 1 else wed if wd == 2 else 0) + rng.normal(0, 0.4), 400),
              codes=("SKH", "CGH"), seed=seed)
    return engine.run(inputs(weekly_from(d), d, hospitals("SKH", "CGH")), NO_FAILS, TODAY)


def test_a_peak_shared_by_two_close_days_is_worded_as_a_two_day_peak():
    # Like SKH in the 9 Nov release: Tuesday 12.70 h, Wednesday 12.59 h (0.11 h apart, under the 0.3 h rule).
    r = next(x for x in published(_weekday_run(4.6, 4.5), "weekday") if x["entity"] == "SKH")
    assert "peak on Tuesday–Wednesday" in r["headline"]
    assert r["chart"]["highlight"] == ["tue", "wed"]
    assert r["chart"]["callout"].startswith("Tuesday–Wednesday peak:")
    assert r["caveats"][0].startswith("The test shows that weekdays differ; the two peak days")


def test_a_clear_single_peak_keeps_its_one_day_wording():
    r = next(x for x in published(_weekday_run(4.6, 1.0), "weekday") if x["entity"] == "SKH")
    assert "longest on Tuesdays" in r["headline"] and r["chart"]["highlight"] == ["tue"]


def test_day_pairs_read_in_week_order_and_wrap_sunday_to_monday():
    from sg_health.insights.detectors.weekday import day_pair
    assert day_pair(2, 1) == "Tuesday–Wednesday"
    assert day_pair(0, 6) == "Sunday–Monday"
    assert day_pair(0, 4) == "Monday and Friday"


def test_every_finding_carries_n_with_its_unit_and_a_ci_where_the_method_gives_one():
    result = _weekday_run(4.6, 1.0)
    for r in result.insights:
        assert r["n"] > 0 and r["n_unit"]
    wk = next(x for x in published(result, "weekday") if x["entity"] == "SKH")
    assert wk["n_unit"] == "days" and wk["ci_low"] < wk["metric_value"] < wk["ci_high"]
    assert wk["evidence_level"] == "robust"           # the peak's 95% range is far above the weekly average


def test_evidence_levels_by_method():
    d = daily(lambda rng, c, i, wd: (4 + 0.03 * i + rng.normal(0, 0.3), 400 + rng.normal(0, 20)), codes=("SGH",), seed=3)
    for r in engine.run(inputs(weekly_from(d), d, hospitals("SGH")), NO_FAILS, TODAY).insights:
        expected = {"anomaly": "observed", "usual_gap": "observed", "access_gap": "observed",
                    "volume_vs_wait": "association-only"}.get(r["type"])
        if expected:
            assert r["evidence_level"] == expected, r["type"]
        else:
            assert r["evidence_level"] in ("tested", "robust"), r["type"]
        if r["p_adjusted"] is None:
            assert not wording.PROBABILITY.search(r["headline"] + " " + r["detail"]), r["insight_id"]


def test_bootstrap_intervals_are_reproducible():
    from sg_health.insights.stats import mean_ci, spearman_ci
    x = np.arange(50, dtype=float)
    assert mean_ci(x) == mean_ci(x)
    lo, hi = mean_ci(x)
    assert lo < 24.5 < hi
    assert spearman_ci(x, x * 2)[0] == pytest.approx(1.0)
    assert mean_ci(np.array([1.0])) is None


# --------------------------------------------------------------------------- #
# Data-review fixes (16 Nov 2026)
# --------------------------------------------------------------------------- #

def test_the_national_rate_ignores_areas_that_are_not_compared():
    # A small city-centre area with many clinics must not lift the yardstick for the areas that are ranked.
    frame = pd.concat([areas_frame(), pd.DataFrame([{"planning_area": "City", "residents_65plus": 500, "cdmp_clinics": 35,
                                                     "cdmp_clinics_per_1k_seniors": 70.0, "as_of": pd.Timestamp("2024-06-06")}])])
    out = access_gap.detect(frame, thresholds()["access_gap"], MIN_C)
    assert out.extra["national_cdmp_per_1k_seniors"] == round(1000 * 53 / 48000, 4)
    assert access_gap.national_rate(frame["residents_65plus"], frame["cdmp_clinics"]) == pytest.approx((53 + 35 + 2) / (48000 + 900 + 500))
    assert any("areas compared" in c for c in out.candidates[0].caveats)


def test_the_map_layer_shortfall_uses_the_same_rate_as_the_findings():
    from sg_health import geo
    a = areas_frame()
    cols = geo.access_gap_columns(a[["planning_area", "residents_65plus", "cdmp_clinics"]])
    big_low = cols.loc[a["planning_area"] == "Big Low", "cdmp_shortfall"].iloc[0]
    out = access_gap.detect(a, thresholds()["access_gap"], MIN_C)
    assert big_low == pytest.approx(out.candidates[0].values["shortfall_n"], abs=0.51)


def test_a_shared_peak_names_its_days_with_their_own_percentages():
    # Monday is lower than Tuesday: "Monday–Tuesday" must pair Monday's percentage first, not the peak's.
    d = daily(lambda rng, c, i, wd: (8 + (4.6 if wd == 1 else 4.5 if wd == 0 else 0) + rng.normal(0, 0.4), 400),
              codes=("SKH", "CGH"), seed=4)
    r = next(x for x in published(engine.run(inputs(weekly_from(d), d, hospitals("SKH", "CGH")), NO_FAILS, TODAY), "weekday")
             if x["entity"] == "SKH")
    assert "Monday–Tuesday" in r["headline"] and r["chart"]["highlight"] == ["mon", "tue"]
    import re
    first, second = (int(x) for x in re.search(r"(\d+)% and (\d+)%", r["headline"]).groups())
    means = {p["key"]: p["value"] for p in r["chart"]["points"]}
    mean = r["comparison_value"]
    assert first == round((means["mon"] / mean - 1) * 100) and second == round((means["tue"] / mean - 1) * 100)


def test_a_peak_that_is_clear_week_by_week_is_not_called_shared():
    # Tuesday is above Wednesday in every week by a steady margin, but the days themselves vary a lot (a wide
    # spread between weeks). Resampling the days independently would call this a tie; pairing by week does not.
    from sg_health.insights.detectors.weekday import shared_peak
    weeks = pd.Series(np.repeat(np.arange(26), 7))
    weekday = pd.Series(np.tile(np.arange(7), 26))
    base = pd.Series(np.repeat(np.random.default_rng(1).normal(8, 3, 26), 7))
    vals = base + np.where(weekday == 1, 0.8, np.where(weekday == 2, 0.0, -1.0)) + np.random.default_rng(2).normal(0, 0.05, 182)
    means = [float(vals[weekday == k].mean()) for k in range(7)]
    boot = thresholds()["engine"]["bootstrap"]
    assert shared_peak(vals, weekday, weeks, means, 1, 0.3, boot) is None
    flat = vals - np.where(weekday == 1, 0.78, 0)
    assert shared_peak(flat, weekday, weeks, [float(flat[weekday == k].mean()) for k in range(7)], 1, 0.3, boot) == 2


def test_the_unusual_gap_needs_the_week_to_be_higher_than_all_8_weeks_before():
    from sg_health.insights.detectors import usual_gap
    cfg = thresholds()["usual_gap"]
    hosp = hospitals("SGH")
    starts = [date(2026, 8, 24) + timedelta(weeks=i) for i in range(9)]

    def weekly_for(values):
        return pd.DataFrame({"hospital_code": "SGH", "week_start": starts, "week_end": starts, "total_attendances": 1,
                             "mean_of_daily_median_wait_hours": values, "is_complete_week": True})
    steady = weekly_for([4.0, 4.1, 3.9, 4.0, 4.2, 3.8, 4.0, 4.1, 5.6])             # +40%, above every one of the 8 weeks
    noisy = weekly_for([2.0, 6.0, 3.0, 7.0, 2.5, 6.5, 4.0, 5.0, 6.5])              # +40% vs usual 4.5, but 6.5 is below its own 7.0 high
    full = float(thresholds()["ranking"]["normalise"]["usual_gap_pct_full"])
    assert usual_gap.detect(steady, hosp, cfg, MIN_C, full).candidates[0].passes_effect
    assert not usual_gap.detect(noisy, hosp, cfg, MIN_C, full).candidates[0].passes_effect


def test_tiny_p_values_are_kept_not_rounded_to_zero():
    result, _ = busy_run()
    ps = [r["p_value"] for r in result.insights if r["p_value"] is not None]
    assert ps and all(p > 0 for p in ps)
    assert engine._round_p(4.2e-17) == 4.2e-17 and engine._round_p(0.123456) == 0.1235 and engine._round_p(None) is None


def test_a_same_day_correlation_says_on_not_after():
    result, _ = busy_run()
    for r in published(result, "volume_vs_wait"):
        same_day = "same day" in r["headline"]
        assert r["chart"]["callout"].startswith("On the busiest days") == same_day, r["chart"]["callout"]


# --------------------------------------------------------------------------- #
# monthly_yoy: visits and bed waits, each against the same month a year before
# --------------------------------------------------------------------------- #

def monthly_frame(n: int = 36, link: float = 0.0, seed: int = 5, partial_last: bool = False) -> pd.DataFrame:
    """n months ending Oct 2026: the change in visits is a slow wave plus noise; the change in wait follows it by `link`."""
    rng = np.random.default_rng(seed)
    months = pd.date_range(end="2026-10-01", periods=n + 12, freq="MS")
    visits = 3 * np.sin(np.arange(n + 12) / 4) + rng.normal(0, 0.5, n + 12)
    wait = link * 10 * visits + rng.normal(0, 3, n + 12)
    df = pd.DataFrame({"month_start": months, "is_complete_month": True, "wait_yoy_pct": wait, "attendances_yoy_pct": visits})
    df.loc[:11, ["wait_yoy_pct", "attendances_yoy_pct"]] = np.nan                  # no year before the first 12 months
    if partial_last:
        df.loc[df.index[-1], ["is_complete_month", "wait_yoy_pct", "attendances_yoy_pct"]] = [False, np.nan, np.nan]
    return df


def monthly_run(frame):
    from sg_health.insights.detectors import monthly_yoy
    return monthly_yoy.detect(frame, thresholds()["monthly_yoy"], MIN_C)


def test_a_planted_link_between_visits_and_waits_year_on_year_is_found():
    out = monthly_run(monthly_frame(link=1.0))
    c = out.candidates[0]
    assert c.type == "monthly_yoy" and c.entity == "All hospitals" and c.effect_size > 0.7 and c.n == 36 and c.n_unit == "months"
    assert c.p_value <= 0.05 and c.passes_effect and c.p_value >= 1 / c.n                  # a rotation test can't go below 1 in n
    assert [p["label"] for p in c.chart["points"]] == ["Lowest", "Lower", "Middle", "Higher", "Highest"]
    assert c.chart["points"][4]["value"] > c.chart["points"][0]["value"] and c.chart["highlight"] == ["q5"]


def test_unrelated_series_are_not_published():
    result = engine.run({**inputs(weekly({"SGH": [4.0] * 12})), "monthly": monthly_frame(link=0.0, seed=9)}, NO_FAILS, TODAY)
    assert not published(result, "monthly_yoy")


def test_the_finding_is_worded_as_an_association_and_is_never_a_headline():
    result = engine.run({**inputs(weekly({"SGH": [4.0] * 12})), "monthly": monthly_frame(link=1.0)}, NO_FAILS, TODAY)
    r = published(result, "monthly_yoy")[0]
    assert r["evidence_level"] == "association-only" and "association only" in r["detail"]
    assert r["headline_rank"] is None and r["scope"] == "system" and r["ci_low"] is not None and r["ci_low"] < r["effect_size"] < r["ci_high"]
    assert not wording.CAUSAL.search(r["headline"] + " " + r["detail"] + " " + r["chart"]["callout"])
    assert r["period_end"] <= r["as_of"]


def test_too_few_months_or_no_monthly_figures_is_a_skip_with_a_reason():
    thin = monthly_frame(n=36, link=1.0).tail(20)
    out = monthly_run(thin)
    assert not out.candidates and "needs 24" in out.skips[0].reason
    for nothing in (None, pd.DataFrame(columns=["month_start", "is_complete_month", "wait_yoy_pct", "attendances_yoy_pct"])):
        assert "no monthly figures" in monthly_run(nothing).skips[0].reason


def test_a_partial_latest_month_is_left_out_not_filled():
    out = monthly_run(monthly_frame(link=1.0, partial_last=True))
    assert out.candidates[0].n == 35 and out.candidates[0].as_of == date(2026, 9, 30)


def test_a_missing_monthly_mart_leaves_the_other_detectors_working():
    result = engine.run({**inputs(weekly({"SGH": [4.0] * 26})), "monthly": None}, NO_FAILS, TODAY)
    assert any(s.type == "monthly_yoy" for s in result.skips) and result.tests >= 1


def test_the_rotation_test_never_gives_a_p_below_one_in_n_and_keeps_the_sign():
    x = np.arange(30, dtype=float)
    rho, p = stats.circular_shift_spearman(x, x * 2)
    assert rho == pytest.approx(1.0) and p == pytest.approx(1 / 30)
    rho, p = stats.circular_shift_spearman(x, -x)
    assert rho == pytest.approx(-1.0) and p == pytest.approx(1 / 30)
    assert stats.circular_shift_spearman(x, np.sin(np.arange(30) * 2.4))[1] > 0.1


def test_the_block_bootstrap_interval_is_reproducible_and_needs_enough_months():
    x = np.arange(40, dtype=float)
    y = x + np.random.default_rng(1).normal(0, 4, 40)
    a = stats.block_bootstrap_spearman_ci(x, y, block=6)
    assert a == stats.block_bootstrap_spearman_ci(x, y, block=6) and a[0] < stats.spearman(x, y)[0] < a[1]
    assert stats.block_bootstrap_spearman_ci(x[:10], y[:10], block=6) is None
