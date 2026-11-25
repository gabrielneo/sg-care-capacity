"""Is the latest complete week well above the hospital's usual level? A plain comparison, no test.

The same comparison as the site's status badge (web/lib/status.ts): the latest complete week's average of
daily medians against the median of the 8 complete weeks before it (the "usual" it shows). It is published only when the week is
far outside the hospital's own range: a robust z-score (median and MAD) of 2.5 or more against its previous 26 complete weeks. A
volatile hospital's ordinary weeks often clear 30% above usual (CGH and SGH did in 37% of weeks since 2025), so a % line alone flags
noise. With fewer than 20 of those 26 weeks, the older rule applies: 30% above usual and higher than all 8 weeks before. It has no
p-value, so it is outside the Benjamini-Hochberg correction.
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
    n_range, min_range, min_z = int(cfg["range_weeks"]), int(cfg["min_range_weeks"]), float(cfg["min_z"])
    range_weeks = [latest - timedelta(weeks=i) for i in range(n_range, 0, -1)]
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
        beyond = x > float(rows[have].max()) if cfg.get("beyond_range", True) else True     # above all 8 weeks before
        history = [float(rows[s]) for s in range_weeks if s in rows.index]
        z = None
        if len(history) >= min_range:
            mid = float(pd.Series(history).median())
            mad = 1.4826 * float((pd.Series(history) - mid).abs().median())
            z = (x - mid) / mad if mad > 0 else None
        passes = z >= min_z if z is not None else (ratio >= line and beyond)
        points = [point(s.isoformat(), short_date(s), float(rows[s])) for s in [*trailing, latest]]
        value_text, unit_text = hours_parts(x)
        out.candidates.append(Candidate(
            type="usual_gap", entity=code, variant="worse",
            method=f"Latest complete week against the median of the 8 complete weeks before it; flagged when {'its robust z-score against the previous ' + str(n_range) + ' weeks is ' + str(min_z) + ' or more' if z is not None else '30% above and higher than all 8 of them'} (no test)",
            n=k + 1, effect_size=ratio, effect_norm=min(max(ratio, 0.0) / full_effect, 1.0), metric_value=x, unit="hours",
            comparison_value=usual, direction="worse", p_value=None, passes_effect=passes,
            completeness=(len(have) + 1) / (k + 1), as_of=latest + timedelta(days=6), source="moh_bed_waits",
            values={"hospital": hospital_name(h), "week": week_text(latest), "value": hours(x), "usual": hours(usual),
                    "pct": percent(ratio * 100), "trailing": k, "window": latest.isoformat()},
            caveats=["This compares one week with its recent usual level; it is not a statistical test.",
                     WEEKLY_CAVEAT, UNIT_CAVEAT, *hospital_caveats(h)],
            evidence={"endpoint": f"/api/v1/ed/weekly?hospital={code}&weeks={n_range + 1}",
                      "query": SQL.format(code=code, start=trailing[0].isoformat(), end=latest.isoformat())},
            action_key=None, action_values={"hospital": hospital_name(h), "cluster": h["cluster"]},
            chart=chart("line", WEEKLY_AXIS, points, [latest.isoformat()], reference=(usual, "Usual level")),
            display={"value_text": value_text, "unit_text": unit_text, "change": "up"},
            period=(latest, latest + timedelta(days=6)),
            n_unit="weeks",
        ))
    return out
