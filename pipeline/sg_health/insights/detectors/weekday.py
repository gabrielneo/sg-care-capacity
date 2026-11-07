"""Is there a peak day? Kruskal-Wallis across weekdays, per hospital and pooled, with epsilon-squared."""
from __future__ import annotations

from datetime import timedelta
from typing import Any

import numpy as np
import pandas as pd

from ..model import Candidate, DetectorResult, Skip
from ..stats import kruskal_epsilon2
from ..wording import percent
from .common import (
    UNIT_CAVEAT,
    WEEKDAYS,
    daily_window,
    hospital_caveats,
    hospital_name,
    latest_complete_week,
    reported_from,
)

SQL = ("SELECT report_date, median_wait_hours FROM marts.fct_ed_daily WHERE hospital_code = '{code}' "
       "AND is_complete_week AND report_date BETWEEN DATE '{start}' AND DATE '{end}' ORDER BY report_date")
CAVEAT = "The test shows that weekdays differ; the peak day is the one with the highest average."


def _peak(values: pd.Series, weekday: pd.Series) -> tuple[int, float]:
    means = values.groupby(weekday).mean()
    day = int(means.idxmax())
    return day, (float(means[day]) / float(values.mean()) - 1) * 100


def detect(daily: pd.DataFrame, weekly: pd.DataFrame, hospitals: pd.DataFrame, cfg: dict[str, Any],
           min_completeness: float, full_effect: float) -> DetectorResult:
    out = DetectorResult()
    latest = latest_complete_week(weekly)
    if latest is None:
        out.skips.append(Skip("weekday", "all", "no complete week in the data"))
        return out
    weeks = int(cfg["weeks"])
    first, last = latest - timedelta(weeks=weeks - 1), latest + timedelta(days=6)
    d = daily_window(daily, latest, weeks)
    d = d[d["is_complete_week"].astype(bool) & d["median_wait_hours"].notna()].copy()
    d["weekday"] = pd.to_datetime(d["report_date"]).dt.day_of_week
    d["week"] = pd.to_datetime(d["report_date"]).dt.to_period("W-SUN")
    pooled: list[pd.DataFrame] = []
    for _, h in hospitals.sort_values("hospital_code").iterrows():
        code = h["hospital_code"]
        rows = d[d["hospital_code"] == code]
        rf = reported_from(h)
        expected = sum(1 for k in range(weeks) if rf is None or first + timedelta(weeks=k, days=6) >= rf)
        n_weeks = rows["week"].nunique()
        completeness = n_weeks / expected if expected else 0.0
        if completeness < min_completeness or n_weeks < int(cfg["min_complete_weeks"]):
            out.skips.append(Skip("weekday", code, f"{n_weeks} of {expected} weeks complete; needs "
                                                   f"{cfg['min_complete_weeks']} and {min_completeness:.0%}"))
            continue
        groups = [rows.loc[rows["weekday"] == k, "median_wait_hours"].to_numpy(dtype=float) for k in range(7)]
        if rows["median_wait_hours"].nunique() < 2 or any(len(g) == 0 for g in groups):
            out.skips.append(Skip("weekday", code, "no variation, or a weekday with no values"))
            continue
        _, p, eps2 = kruskal_epsilon2(groups)
        day, pct = _peak(rows["median_wait_hours"], rows["weekday"])
        out.candidates.append(_candidate(code, "hospital", eps2, p, pct, day, len(rows), n_weeks, completeness, last, cfg,
                                         full_effect, {"hospital": hospital_name(h)}, hospital_caveats(h),
                                         SQL.format(code=code, start=first, end=last), float(rows["median_wait_hours"].mean()),
                                         float(rows.loc[rows["weekday"] == day, "median_wait_hours"].mean()),
                                         {"hospital": hospital_name(h), "cluster": h["cluster"]}))
        pooled.append(rows.assign(rel=rows["median_wait_hours"] / rows["median_wait_hours"].mean()))
    if len(pooled) >= 2:
        allrows = pd.concat(pooled)
        groups = [allrows.loc[allrows["weekday"] == k, "rel"].to_numpy(dtype=float) for k in range(7)]
        _, p, eps2 = kruskal_epsilon2(groups)
        day, pct = _peak(allrows["rel"], allrows["weekday"])
        out.candidates.append(_candidate("All hospitals", "pooled", eps2, p, pct, day, len(allrows), weeks, 1.0, last, cfg,
                                         full_effect, {"n_hospitals": len(pooled)},
                                         ["Each hospital's waits are compared with its own weekly average before pooling."],
                                         "-- each hospital's daily values divided by its own mean, then pooled by weekday",
                                         1.0, float(np.mean(allrows.loc[allrows["weekday"] == day, "rel"])), {}))
    return out


def _candidate(entity, variant, eps2, p, pct, day, n, n_weeks, completeness, last, cfg, full_effect, values, caveats,
               query, mean, peak_mean, action_values) -> Candidate:
    return Candidate(
        type="weekday", entity=entity, variant=variant, method="Kruskal-Wallis test across weekdays; epsilon-squared",
        n=n, effect_size=eps2, effect_norm=min(eps2 / full_effect, 1.0), metric_value=peak_mean, unit="hours" if variant == "hospital" else "ratio to own mean",
        comparison_value=mean, direction="neutral", p_value=p, passes_effect=eps2 >= float(cfg["min_epsilon_squared"]),
        completeness=min(completeness, 1.0), as_of=last, source="moh_bed_waits",
        values={**values, "weekday": WEEKDAYS[day], "pct": percent(pct), "weeks": n_weeks, "window": str(last)},
        caveats=[CAVEAT, UNIT_CAVEAT, *caveats],
        evidence={"endpoint": "/api/v1/ed/daily" + (f"?hospital={entity}" if variant == "hospital" else ""), "query": query},
        action_key=None, action_values={**action_values, "weekday": WEEKDAYS[day]},
    )
