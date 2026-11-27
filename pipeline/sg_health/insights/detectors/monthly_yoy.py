"""Do months with more ED visits than a year before also have longer bed waits than a year before? Spearman on the change
against the same month a year earlier, across the full emergency departments, tested with a circular-shift permutation.

Why year on year: each month is set against the same month a year earlier, which removes differences between months of the year
(on average May long, August short) that would otherwise make visits and waits look linked. Why not the usual p-value: neighbouring months' changes overlap
and drift together (see stats.circular_shift_spearman), so the test keeps each series' own serial pattern.
"""
from __future__ import annotations

from datetime import date, timedelta
from functools import partial
from typing import Any

import numpy as np
import pandas as pd

from ..model import Candidate, DetectorResult, Skip, chart, point, thresholds
from ..stats import block_bootstrap_spearman_ci, circular_shift_spearman, strength_label
from ..wording import count

SQL = ("SELECT month_start, wait_yoy_pct, attendances_yoy_pct FROM marts.fct_ed_system_monthly "
       "WHERE is_complete_month AND wait_yoy_pct IS NOT NULL AND attendances_yoy_pct IS NOT NULL ORDER BY month_start")
GROUPS = ["Lowest", "Lower", "Middle", "Higher", "Highest"]
ADVERB = {"negligible": "negligibly", "weak": "weakly", "moderate": "moderately", "strong": "strongly"}
CAVEATS = ["This is an association only; it does not show why waits move.",
           "Each month's change is set against the same month a year before, so neighbouring months overlap; the test allows for that.",
           "Only the full emergency departments MOH reported throughout are included."]


def _month_end(d: date) -> date:
    nxt = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
    return nxt - timedelta(days=1)


def _fifths(visits: np.ndarray, wait: np.ndarray) -> tuple[list[dict[str, Any]], float]:
    """Months in five equal groups by the change in visits; the median change in wait in each. The chart, not the test."""
    df = pd.DataFrame({"v": visits, "w": wait})
    group = pd.qcut(df["v"].rank(method="first"), 5, labels=False)
    med = df.groupby(group)["w"].median()
    return [point(f"q{k + 1}", GROUPS[k], float(med[k])) for k in range(5)], float(med[4] - med[0])


def detect(monthly: pd.DataFrame | None, cfg: dict[str, Any], min_completeness: float) -> DetectorResult:
    out = DetectorResult()
    if monthly is None or monthly.empty:
        out.skips.append(Skip("monthly_yoy", "all", "this data has no monthly figures with a year-on-year change"))
        return out
    m = monthly.assign(month_start=pd.to_datetime(monthly["month_start"]).dt.date).sort_values("month_start")
    has_change = m["is_complete_month"].astype(bool) & m["wait_yoy_pct"].notna() & m["attendances_yoy_pct"].notna()
    if not has_change.any():
        out.skips.append(Skip("monthly_yoy", "all", "no month has a year-on-year change in both visits and bed wait"))
        return out
    last = m.loc[has_change, "month_start"].max()
    window = int(cfg["window_months"])
    first = date((last.year * 12 + last.month - 1 - (window - 1)) // 12, (last.month - 1 - (window - 1)) % 12 + 1, 1)
    w = m[has_change & (m["month_start"] >= first)]
    # Months in the window that could have a change at all: those with a month a year earlier in the series.
    months_in_series = set(m["month_start"])
    possible = sum(1 for d in pd.date_range(first, last, freq="MS").date if date(d.year - 1, d.month, 1) in months_in_series)
    n = len(w)
    completeness = n / possible if possible else 0.0
    need = int(cfg["min_pairs"])
    if n < need:
        out.skips.append(Skip("monthly_yoy", "all", f"{n} months with a year-on-year change in visits and waits; needs {need}"))
        return out
    if completeness < min_completeness:
        out.skips.append(Skip("monthly_yoy", "all", f"{n} of {possible} months present ({completeness:.0%}), below {min_completeness:.0%}"))
        return out
    visits, wait = w["attendances_yoy_pct"].to_numpy(dtype=float), w["wait_yoy_pct"].to_numpy(dtype=float)
    if np.unique(visits).size < 2 or np.unique(wait).size < 2:
        out.skips.append(Skip("monthly_yoy", "all", "no month-to-month variation to compare"))
        return out
    rho, p = circular_shift_spearman(visits, wait)
    label = strength_label(rho, cfg["strength"])
    points, diff = _fifths(visits, wait)
    as_of = _month_end(w["month_start"].max())
    boot = thresholds()["engine"]["bootstrap"]
    out.candidates.append(Candidate(
        type="monthly_yoy", entity="All hospitals", variant="positive" if rho >= 0 else "negative",
        method="Spearman correlation of the change in visits and the change in bed wait, each against the same month a year before; "
               "p-value from rotating one series against the other (allows for overlap and drift)",
        n=n, effect_size=rho, effect_norm=abs(rho), metric_value=rho, unit="Spearman correlation", comparison_value=None,
        direction="neutral", p_value=p, passes_effect=label != "negligible", completeness=min(completeness, 1.0),
        as_of=as_of, source="moh_bed_waits",
        values={"strength": ADVERB[label], "strength_label": label, "n": count(n), "window": f"{first}|{as_of}",
                "diff": f"{abs(diff):.0f}", "higher_lower": "higher" if diff >= 0 else "lower"},
        caveats=list(CAVEATS) + [f"The link is {label} (Spearman correlation {rho:.2f})."],
        evidence={"endpoint": f"/api/v1/ed/system/monthly?months={window}", "query": SQL},
        action_key=None, action_values={},
        chart=chart("bar", "Median change in bed wait, % on a year before", points, ["q5"],
                    x_label="Months in five groups by change in visits",
                    reference=(0.0, "No change on a year before")),
        display={"value_text": f"{rho:.2f}", "unit_text": None, "change": None},
        period=(first, as_of), n_unit="months",
        pairs=[(d.isoformat(), round(float(x), 4), round(float(y), 4)) for d, x, y in zip(w["month_start"], visits, wait, strict=True)],
        ci_null=0.0, ci_fn=partial(block_bootstrap_spearman_ci, visits, wait, block=int(cfg["block"]), resamples=int(boot["resamples"]),
                                    level=float(boot["level"]), seed=int(boot["seed"])),
    ))
    return out
