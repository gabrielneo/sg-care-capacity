"""Are bed waits rising or falling? Theil-Sen slope and Mann-Kendall test per hospital."""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from ..model import Candidate, DetectorResult, Skip, chart, point
from ..stats import mann_kendall, theil_sen
from ..wording import hours
from .common import (
    UNIT_CAVEAT,
    WEEKLY_AXIS,
    WEEKLY_CAVEAT,
    expected_weeks,
    hospital_caveats,
    hospital_name,
    hours_parts,
    latest_complete_week,
    reported_from,
    short_date,
    window_starts,
)

SQL = ("SELECT week_start, mean_of_daily_median_wait_hours FROM marts.fct_ed_weekly "
       "WHERE hospital_code = '{code}' AND is_complete_week AND week_start >= DATE '{start}' ORDER BY week_start")


def detect(weekly: pd.DataFrame, hospitals: pd.DataFrame, cfg: dict[str, Any], min_completeness: float) -> DetectorResult:
    out = DetectorResult()
    latest = latest_complete_week(weekly)
    if latest is None:
        out.skips.append(Skip("trend", "all", "no complete week in the data"))
        return out
    starts = window_starts(latest, int(cfg["weeks"]))
    w = weekly.assign(week_start=pd.to_datetime(weekly["week_start"]).dt.date)
    w = w[w["week_start"].isin(starts) & w["is_complete_week"].astype(bool) & w["mean_of_daily_median_wait_hours"].notna()]
    for _, h in hospitals.sort_values("hospital_code").iterrows():
        code = h["hospital_code"]
        rows = w[w["hospital_code"] == code].sort_values("week_start")
        expected = expected_weeks(starts, reported_from(h))
        n = len(rows)
        completeness = n / expected if expected else 0.0
        if completeness < min_completeness:
            out.skips.append(Skip("trend", code, f"{n} of {expected} weeks complete ({completeness:.0%}), below {min_completeness:.0%}"))
            continue
        if n < int(cfg["min_complete_weeks"]):
            out.skips.append(Skip("trend", code, f"{n} complete weeks; needs {cfg['min_complete_weeks']}"))
            continue
        x = np.array([(s - starts[0]).days / 7 for s in rows["week_start"]])
        y = rows["mean_of_daily_median_wait_hours"].to_numpy(dtype=float)
        slope, intercept, _, _ = theil_sen(y, x)
        mk = mann_kendall(y, correct=cfg.get("autocorrelation_correction") == "yue_wang")
        start, end = intercept, intercept + slope * (len(starts) - 1)
        direction = "worse" if slope > 0 else "better"
        by_week = dict(zip(rows["week_start"], y, strict=True))
        points = [point(s.isoformat(), short_date(s), by_week.get(s)) for s in starts]   # a missing week stays a gap
        last_seen = max(rows["week_start"]).isoformat()
        value_text, unit_text = hours_parts(abs(slope))
        out.candidates.append(Candidate(
            type="trend", entity=code, variant=direction,
            method=f"Theil-Sen slope; Mann-Kendall test with Yue-Wang autocorrelation correction (lag-1 r = {mk.lag1:.2f})",
            n=n, effect_size=mk.tau, effect_norm=abs(mk.tau), metric_value=slope, unit="hours per week",
            comparison_value=float(np.median(y)), direction=direction, p_value=mk.p_value,
            passes_effect=abs(slope) >= float(cfg["min_abs_slope_hours_per_week"]), completeness=min(completeness, 1.0),
            as_of=rows["week_start"].iloc[-1] + pd.Timedelta(days=6), source="moh_bed_waits",
            values={"hospital": hospital_name(h), "slope": hours(abs(slope)), "weeks": len(starts),
                    "start": hours(start), "end": hours(end), "window": starts[0].isoformat()},
            caveats=["Weeks next to each other are similar; the test allows for that.", WEEKLY_CAVEAT, UNIT_CAVEAT,
                     *hospital_caveats(h)],
            evidence={"endpoint": f"/api/v1/ed/weekly?hospital={code}&weeks={cfg['weeks']}",
                      "query": SQL.format(code=code, start=starts[0].isoformat())},
            action_key=direction, action_values={"hospital": hospital_name(h), "cluster": h["cluster"]},
            chart=chart("line", WEEKLY_AXIS, points, [last_seen], trend_line=(start, end)),
            display={"value_text": value_text, "unit_text": f"{unit_text} a week", "change": "up" if slope > 0 else "down"},
        ))
    return out
