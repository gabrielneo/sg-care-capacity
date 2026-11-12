"""Do more ED visits come with longer bed waits? Spearman correlation per hospital at lags 0, 1, 2."""
from __future__ import annotations

from datetime import timedelta
from typing import Any

import pandas as pd

from ..model import Candidate, DetectorResult, Skip, chart, point
from ..stats import spearman, strength_label
from ..wording import hours
from .common import (
    UNIT_CAVEAT,
    daily_window,
    expected_days,
    hospital_caveats,
    hospital_name,
    latest_complete_week,
    reported_from,
)

LAG_PHRASE = {0: "on the same day", 1: "the day before", 2: "two days before"}
AFTER_PHRASE = {0: "on the same day", 1: "the day after", 2: "two days after"}      # from the visits' side
GROUPS = ["Quietest", "Quieter", "Middle", "Busier", "Busiest"]
ADVERB = {"negligible": "negligibly", "weak": "weakly", "moderate": "moderately", "strong": "strongly"}
SQL = ("SELECT report_date, attendances, median_wait_hours FROM marts.fct_ed_daily WHERE hospital_code = '{code}' "
       "AND report_date BETWEEN DATE '{start}' AND DATE '{end}' ORDER BY report_date")


def _adjust(s: pd.Series, weekday: pd.Series) -> pd.Series:
    """Remove the usual weekday pattern: subtract each weekday's median."""
    return s - s.groupby(weekday).transform("median")


def _fifths(pair: pd.DataFrame) -> tuple[list[dict[str, Any]], float]:
    """Days in five equal groups by visits (v); the median bed wait (w) in each. The chart, not the test.

    Returns the five points and the busiest group's median minus the quietest's.
    """
    group = pd.qcut(pair["v"].rank(method="first"), 5, labels=False)
    med = pair.groupby(group)["w"].median()
    points = [point(f"q{k + 1}", GROUPS[k], float(med[k])) for k in range(5)]
    return points, float(med[4] - med[0])


def detect(daily: pd.DataFrame, weekly: pd.DataFrame, hospitals: pd.DataFrame, cfg: dict[str, Any],
           min_completeness: float) -> DetectorResult:
    out = DetectorResult()
    latest = latest_complete_week(weekly)
    if latest is None:
        out.skips.append(Skip("volume_vs_wait", "all", "no complete week in the data"))
        return out
    weeks = int(cfg["weeks"])
    first, last = latest - timedelta(weeks=weeks - 1), latest + timedelta(days=6)
    d = daily_window(daily, latest, weeks)
    for _, h in hospitals.sort_values("hospital_code").iterrows():
        code = h["hospital_code"]
        rows = d[d["hospital_code"] == code].sort_values("report_date")
        both = rows.dropna(subset=["attendances", "median_wait_hours"])
        expected = expected_days(first, last, reported_from(h))
        completeness = len(both) / expected if expected else 0.0
        if completeness < min_completeness:
            out.skips.append(Skip("volume_vs_wait", code, f"{len(both)} of {expected} days with both figures "
                                                          f"({completeness:.0%}), below {min_completeness:.0%}"))
            continue
        s = both.set_index(pd.to_datetime(both["report_date"]))
        visits, wait = s["attendances"].astype(float), s["median_wait_hours"].astype(float)
        if cfg.get("adjust_for_weekday", True):
            visits, wait = _adjust(visits, visits.index.day_of_week), _adjust(wait, wait.index.day_of_week)
        for lag in cfg["lags"]:
            shifted = wait.copy()
            shifted.index = shifted.index - pd.Timedelta(days=int(lag))        # wait on day t+lag lines up with visits on day t
            pair = pd.concat([visits.rename("v"), shifted.rename("w")], axis=1, join="inner").dropna()
            if len(pair) < int(cfg["min_pairs"]):
                out.skips.append(Skip("volume_vs_wait", f"{code} lag {lag}", f"{len(pair)} paired days; needs {cfg['min_pairs']}"))
                continue
            if pair["v"].nunique() < 2 or pair["w"].nunique() < 2:
                out.skips.append(Skip("volume_vs_wait", f"{code} lag {lag}", "no day-to-day variation to compare"))
                continue
            rho, p = spearman(pair["v"].to_numpy(), pair["w"].to_numpy())
            label = strength_label(rho, cfg["strength"])
            variant = "positive" if rho >= 0 else "negative"
            adjusted = bool(cfg.get("adjust_for_weekday", True))
            points, diff = _fifths(pair)
            after = AFTER_PHRASE[int(lag)]
            out.candidates.append(Candidate(
                type="volume_vs_wait", entity=code, variant=variant,
                method=f"Spearman correlation, visits on day t vs bed wait on day t+{lag}"
                       + (", after removing each weekday's median" if cfg.get("adjust_for_weekday", True) else ""),
                n=len(pair), effect_size=rho, effect_norm=abs(rho), metric_value=rho, unit="Spearman correlation",
                comparison_value=None, direction="neutral", p_value=p, passes_effect=label != "negligible",
                completeness=min(completeness, 1.0), as_of=last, source="moh_bed_waits",
                values={"hospital": hospital_name(h), "strength": ADVERB[label], "lag_phrase": LAG_PHRASE[int(lag)],
                        "n": f"{len(pair):,d}", "window": f"{first}|lag{lag}", "strength_label": label,
                        "after_phrase": after, "diff": hours(abs(diff)), "longer_shorter": "longer" if diff >= 0 else "shorter"},
                caveats=["This is an association only; it does not show why waits move.", f"The link is {label} (Spearman correlation {rho:.2f}).",
                         UNIT_CAVEAT, *hospital_caveats(h)],
                evidence={"endpoint": f"/api/v1/ed/daily?hospital={code}&from={first}&to={last}",
                          "query": SQL.format(code=code, start=first, end=last)},
                action_key="negligible_or_weak" if label in ("negligible", "weak") else "moderate_or_strong",
                action_values={"hospital": hospital_name(h), "cluster": h["cluster"]},
                chart=chart("bar", f"Median bed wait {after}, hours" + (" vs weekday usual" if adjusted else ""), points,
                            ["q5"], x_label="Days in five equal groups by ED visits" + (" vs usual" if adjusted else ""),
                            reference=(0.0, "Usual for that weekday") if adjusted else None),
                display={"value_text": f"{rho:.2f}", "unit_text": None, "change": None},
                period=(first, last),
            ))
    return out
