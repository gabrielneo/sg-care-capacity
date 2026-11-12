"""Is the latest complete week well above the hospital's usual level? A plain comparison, no test.

The same comparison as the site's status badge (web/lib/status.ts): the latest complete week's average of
daily medians against the median of the 8 complete weeks before it. Published only at or above the
"much higher" line (30% by default). It has no p-value, so it is outside the Benjamini-Hochberg correction.
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any

import pandas as pd

from ..model import Candidate, DetectorResult, Skip, chart, point
from ..wording import hours, percent
from .anomaly import SQL
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


def detect(weekly: pd.DataFrame, hospitals: pd.DataFrame, cfg: dict[str, Any], min_completeness: float,
           full_effect: float) -> DetectorResult:
    out = DetectorResult()
    latest = latest_complete_week(weekly)
    if latest is None:
        out.skips.append(Skip("usual_gap", "all", "no complete week in the data"))
        return out
    k = int(cfg["trailing_weeks"])
    trailing = [latest - timedelta(weeks=i) for i in range(k, 0, -1)]
    w = weekly.assign(week_start=pd.to_datetime(weekly["week_start"]).dt.date)
    w = w[w["is_complete_week"].astype(bool) & w["mean_of_daily_median_wait_hours"].notna()]
    line = float(cfg["min_pct_above"])
    for _, h in hospitals.sort_values("hospital_code").iterrows():
        code = h["hospital_code"]
        rows = w[w["hospital_code"] == code].set_index("week_start")["mean_of_daily_median_wait_hours"]
        have = [s for s in trailing if s in rows.index]
        if latest not in rows.index or len(have) < k:
            out.skips.append(Skip("usual_gap", code, f"needs the latest week and all {k} weeks before it complete "
                                                      f"({len(have) + (latest in rows.index)} of {k + 1})"))
            continue
        x, usual = float(rows[latest]), float(rows[have].median())
        if usual <= 0:
            out.skips.append(Skip("usual_gap", code, "the usual level is not above zero"))
            continue
        ratio = x / usual - 1
        points = [point(s.isoformat(), short_date(s), float(rows[s])) for s in [*trailing, latest]]
        value_text, unit_text = hours_parts(x)
        out.candidates.append(Candidate(
            type="usual_gap", entity=code, variant="worse",
            method="Latest complete week against the median of the 8 complete weeks before it (no test)",
            n=k + 1, effect_size=ratio, effect_norm=min(max(ratio, 0.0) / full_effect, 1.0), metric_value=x, unit="hours",
            comparison_value=usual, direction="worse", p_value=None, passes_effect=ratio >= line,
            completeness=(len(have) + 1) / (k + 1), as_of=latest + timedelta(days=6), source="moh_bed_waits",
            values={"hospital": hospital_name(h), "week": week_text(latest), "value": hours(x), "usual": hours(usual),
                    "pct": percent(ratio * 100), "trailing": k, "window": latest.isoformat()},
            caveats=["This compares one week with its recent usual level; it is not a statistical test.",
                     WEEKLY_CAVEAT, UNIT_CAVEAT, *hospital_caveats(h)],
            evidence={"endpoint": f"/api/v1/ed/weekly?hospital={code}&weeks={k + 1}",
                      "query": SQL.format(code=code, start=trailing[0].isoformat(), end=latest.isoformat())},
            action_key=None, action_values={"hospital": hospital_name(h), "cluster": h["cluster"]},
            chart=chart("line", WEEKLY_AXIS, points, [latest.isoformat()], reference=(usual, "Usual level")),
            display={"value_text": value_text, "unit_text": unit_text, "change": "up"},
            period=(latest, latest + timedelta(days=6)),
        ))
    return out
