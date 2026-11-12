"""Was this week unusual? Robust z-score of the latest complete week vs the 8 weeks before."""
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
    k = int(cfg["trailing_weeks"])
    trailing = [latest - timedelta(weeks=i) for i in range(k, 0, -1)]
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
        x = float(rows[latest])
        r = robust_z(x, rows[have].to_numpy())
        if r is None:
            out.skips.append(Skip("anomaly", code, f"no variation in the {k} weeks before (MAD is 0)"))
            continue
        z, med, _ = r
        direction = "worse" if x > med else "better"
        points = [point(s.isoformat(), short_date(s), float(rows[s])) for s in [*trailing, latest]]
        value_text, unit_text = hours_parts(x)
        out.candidates.append(Candidate(
            type="anomaly", entity=code, variant=direction, method="Robust z-score (median and MAD of the 8 weeks before)",
            n=k + 1, effect_size=z, effect_norm=min(abs(z) / full_effect, 1.0), metric_value=x, unit="hours",
            comparison_value=med, direction=direction, p_value=None, passes_effect=abs(z) >= float(cfg["threshold"]),
            completeness=completeness, as_of=latest + timedelta(days=6), source="moh_bed_waits",
            values={"hospital": hospital_name(h), "week": week_text(latest), "value": hours(x), "usual": hours(med),
                    "trailing": k, "window": latest.isoformat()},
            caveats=["One unusual week is not a trend.", WEEKLY_CAVEAT, UNIT_CAVEAT, *hospital_caveats(h)],
            evidence={"endpoint": f"/api/v1/ed/weekly?hospital={code}&weeks={k + 1}",
                      "query": SQL.format(code=code, start=trailing[0].isoformat(), end=latest.isoformat())},
            action_key=direction, action_values={"hospital": hospital_name(h), "cluster": h["cluster"]},
            chart=chart("line", WEEKLY_AXIS, points, [latest.isoformat()], reference=(med, "Usual level")),
            period=(latest, latest + timedelta(days=6)),
            display={"value_text": value_text, "unit_text": unit_text, "change": "up" if x > med else "down"},
        ))
    return out
