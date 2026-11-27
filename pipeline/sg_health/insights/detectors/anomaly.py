"""Was this week unusual? Robust z-score of the latest complete week against the hospital's previous 26 complete weeks.

The same z-score as the site's status badge (web/lib/status.ts): median and MAD of the previous 26 complete weeks, at least 20 of
them. Its 3.5 line (Iglewicz and Hoaglin) is beyond the badge's 2.5, so a week this detector flags always carries a badge in the
same direction. The "usual level" shown is the median of the 8 complete weeks before, as on the badge.
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any

import pandas as pd

from ..model import Candidate, DetectorResult, Skip, chart, point
from ..stats import robust_z
from ..wording import hours
from .common import (
    UNIT_CAVEAT,
    WEEKLY_AXIS,
    WEEKLY_CAVEAT,
    hospital_caveats,
    hospital_name,
    hours_parts,
    latest_complete_week,
    short_date,
    week_text,
)

SQL = ("SELECT week_start, mean_of_daily_median_wait_hours FROM marts.fct_ed_weekly "
       "WHERE hospital_code = '{code}' AND week_start BETWEEN DATE '{start}' AND DATE '{end}' ORDER BY week_start")


def detect(weekly: pd.DataFrame, hospitals: pd.DataFrame, cfg: dict[str, Any], min_completeness: float,
           full_effect: float) -> DetectorResult:
    out = DetectorResult()
    latest = latest_complete_week(weekly)
    if latest is None:
        out.skips.append(Skip("anomaly", "all", "no complete week in the data"))
        return out
    k, n_range, min_range = int(cfg["trailing_weeks"]), int(cfg["range_weeks"]), int(cfg["min_range_weeks"])
    trailing = [latest - timedelta(weeks=i) for i in range(k, 0, -1)]
    range_weeks = [latest - timedelta(weeks=i) for i in range(n_range, 0, -1)]
    w = weekly.assign(week_start=pd.to_datetime(weekly["week_start"]).dt.date)
    w = w[w["is_complete_week"].astype(bool) & w["mean_of_daily_median_wait_hours"].notna()]
    for _, h in hospitals.sort_values("hospital_code").iterrows():
        code = h["hospital_code"]
        rows = w[w["hospital_code"] == code].set_index("week_start")["mean_of_daily_median_wait_hours"]
        have = [s for s in trailing if s in rows.index]
        completeness = (len(have) + (latest in rows.index)) / (k + 1)
        if latest not in rows.index or completeness < min_completeness or len(have) < k:
            out.skips.append(Skip("anomaly", code, f"needs the latest week and all {k} weeks before it complete "
                                                   f"({len(have) + (latest in rows.index)} of {k + 1})"))
            continue
        history = [s for s in range_weeks if s in rows.index]
        if len(history) < min_range:
            out.skips.append(Skip("anomaly", code, f"{len(history)} of the {n_range} complete weeks before; needs {min_range}"))
            continue
        x = float(rows[latest])
        r = robust_z(x, rows[history].to_numpy())
        if r is None:
            out.skips.append(Skip("anomaly", code, f"no variation in the {n_range} weeks before (MAD is 0)"))
            continue
        z, _, _ = r
        med = float(rows[have].median())                   # the usual level shown: the 8 weeks before, as on the badge
        direction = "worse" if z > 0 else "better"            # the z-score decides, as on the badge
        points = [point(s.isoformat(), short_date(s), float(rows[s])) for s in [*trailing, latest]]
        value_text, unit_text = hours_parts(x)
        out.candidates.append(Candidate(
            type="anomaly", entity=code, variant=direction, method=f"Robust z-score (median and MAD of the previous {n_range} complete weeks, as the status badge)",
            n=k + 1, effect_size=z, effect_norm=min(abs(z) / full_effect, 1.0), metric_value=x, unit="hours",
            comparison_value=med, direction=direction, p_value=None, passes_effect=abs(z) >= float(cfg["threshold"]),
            completeness=completeness, as_of=latest + timedelta(days=6), source="moh_bed_waits",
            values={"hospital": hospital_name(h), "week": week_text(latest), "value": hours(x), "usual": hours(med),
                    "trailing": k, "range": n_range, "window": latest.isoformat()},
            caveats=["One unusual week is not a trend.", WEEKLY_CAVEAT, UNIT_CAVEAT, *hospital_caveats(h)],
            evidence={"endpoint": f"/api/v1/ed/weekly?hospital={code}&weeks={n_range + 1}",
                      "query": SQL.format(code=code, start=range_weeks[0].isoformat(), end=latest.isoformat())},
            action_key=direction, action_values={"hospital": hospital_name(h), "cluster": h["cluster"]},
            chart=chart("line", WEEKLY_AXIS, points, [latest.isoformat()], reference=(med, "Usual level")),
            period=(latest, latest + timedelta(days=6)),
            n_unit="weeks",
            display={"value_text": value_text, "unit_text": unit_text, "change": "up" if z > 0 else "down"},
        ))
    return out
