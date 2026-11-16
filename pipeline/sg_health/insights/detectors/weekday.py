"""Is there a peak day? Kruskal-Wallis across weekdays, per hospital and pooled, with epsilon-squared."""
from __future__ import annotations

from datetime import timedelta
from typing import Any

import pandas as pd

from ..model import Candidate, DetectorResult, Skip, chart, point, thresholds
from ..stats import kruskal_epsilon2, mean_ci
from ..wording import hours, percent
from .common import (
    UNIT_CAVEAT,
    WEEKDAYS,
    daily_window,
    hospital_caveats,
    hospital_name,
    hours_parts,
    latest_complete_week,
    reported_from,
)

SQL = ("SELECT report_date, median_wait_hours FROM marts.fct_ed_daily WHERE hospital_code = '{code}' "
       "AND is_complete_week AND report_date BETWEEN DATE '{start}' AND DATE '{end}' ORDER BY report_date")
WEEKDAY_AXIS = "Hours, average of the daily medians on that weekday"
CAVEAT = "The test shows that weekdays differ; the peak day is the one with the highest average."
TIE_CAVEAT = "The test shows that weekdays differ; the two peak days are too close to tell apart, so both are named."


def _peak(values: pd.Series, weekday: pd.Series) -> tuple[int, float]:
    means = values.groupby(weekday).mean()
    day = int(means.idxmax())
    return day, (float(means[day]) / float(values.mean()) - 1) * 100


def pair_order(a: int, b: int) -> tuple[int, int]:
    """Two weekdays in the order a sentence reads them: week order, with Sunday–Monday wrapping."""
    first, second = sorted((a, b))
    return (6, 0) if (first, second) == (0, 6) else (first, second)


def day_pair(a: int, b: int) -> str:
    """Two weekdays in week order: "Tuesday–Wednesday" when next to each other (Sunday–Monday wraps), else "Monday and Friday"."""
    first, second = sorted((a, b))
    if second - first == 1:
        return f"{WEEKDAYS[first]}–{WEEKDAYS[second]}"
    if (first, second) == (0, 6):
        return f"{WEEKDAYS[6]}–{WEEKDAYS[0]}"
    return f"{WEEKDAYS[first]} and {WEEKDAYS[second]}"


def shared_peak(values: pd.Series, weekday: pd.Series, week: pd.Series, day_means: list[float], day: int,
                tie_hours: float | None, boot: dict[str, Any]) -> int | None:
    """The next-highest day if the peak is shared with it, else None. Shared when the two averages differ by
    less than `tie_hours` (per hospital; None for the pooled ratios) or the 95% CI of their difference includes 0.

    The difference is taken week by week: both days come from the same weeks, so the weeks are the pairs. Resampling
    the two days independently would ignore that and widen the interval until nearly every peak looked shared.
    """
    second = max((k for k in range(7) if k != day), key=lambda k: day_means[k])
    diff = day_means[day] - day_means[second]
    if tie_hours is not None and diff < tie_hours:
        return second
    per_week = lambda k: values[weekday == k].groupby(week[weekday == k]).mean()      # noqa: E731
    gaps = (per_week(day) - per_week(second)).dropna()
    ci = mean_ci(gaps.to_numpy(), **boot)
    return second if ci is not None and ci[0] <= 0 else None


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
        out.candidates.append(_candidate(
            rows["median_wait_hours"], rows["weekday"], rows["week"],
            code, "hospital", eps2, p, pct, day, len(rows), n_weeks, completeness, first, last, cfg, full_effect,
            {"hospital": hospital_name(h)}, hospital_caveats(h), SQL.format(code=code, start=first, end=last),
            f"/api/v1/ed/daily?hospital={code}&from={first}&to={last}",
            _day_means(rows["median_wait_hours"], rows["weekday"]), float(rows["median_wait_hours"].mean()),
            {"hospital": hospital_name(h), "cluster": h["cluster"]}))
        # The pooled finding is across hospitals, so the urgent care centre is left out (ADR 0012).
        if h.get("facility_type") != "UCC":
            pooled.append(rows.assign(rel=rows["median_wait_hours"] / rows["median_wait_hours"].mean()))
    if len(pooled) >= 2:
        allrows = pd.concat(pooled)
        groups = [allrows.loc[allrows["weekday"] == k, "rel"].to_numpy(dtype=float) for k in range(7)]
        _, p, eps2 = kruskal_epsilon2(groups)
        day, pct = _peak(allrows["rel"], allrows["weekday"])
        out.candidates.append(_candidate(
            allrows["rel"], allrows["weekday"], allrows["week"],
            "All hospitals", "pooled", eps2, p, pct, day, len(allrows), weeks, 1.0, first, last, cfg, full_effect,
            {"n_hospitals": len(pooled)}, ["Each hospital's waits are compared with its own weekly average before pooling."],
            "-- each hospital's daily values divided by its own mean, then pooled by weekday",
            f"/api/v1/ed/daily?from={first}&to={last}", _day_means(allrows["rel"], allrows["weekday"]), 1.0, {}))
    return out


def _day_means(values: pd.Series, weekday: pd.Series) -> list[float]:
    """The average for each weekday, Monday first: the bars of the chart (the peak is the highest)."""
    means = values.groupby(weekday).mean()
    return [float(means[k]) for k in range(7)]


def _candidate(raw, raw_weekday, raw_week, entity, variant, eps2, p, pct, day, n, n_weeks, completeness, first, last, cfg, full_effect,
               values, caveats, query, endpoint, day_means, mean, action_values) -> Candidate:
    hospital = variant == "hospital"
    boot = thresholds()["engine"]["bootstrap"]
    peak = day_means[day]
    keys = [d[:3].lower() for d in WEEKDAYS]
    points = [point(k, d[:3], v) for k, d, v in zip(keys, WEEKDAYS, day_means, strict=True)]
    # The peak day's average, with its 95% CI; and whether the next-highest day shares the peak (B2).
    ci = mean_ci(raw[raw_weekday == day].to_numpy(), **boot)
    second = shared_peak(raw, raw_weekday, raw_week, day_means, day, float(cfg["tie_hours"]) if hospital else None, boot)
    highlight = [keys[day]] if second is None else [keys[k] for k in sorted((day, second))]
    tie_values: dict[str, Any] = {}
    if second is not None:
        # pct and pct2 follow the order the days are named in ("Monday–Tuesday, 48% and 60%"), not their rank.
        a, b = pair_order(day, second)
        tie_values = {"days": day_pair(day, second), "weekday2": WEEKDAYS[second],
                      "pct": percent((day_means[a] / mean - 1) * 100), "pct2": percent((day_means[b] / mean - 1) * 100)}
    if second is not None:
        variant = f"{variant}_tie"
    if hospital:
        axis, reference, (value_text, unit_text) = WEEKDAY_AXIS, (mean, "Weekly average"), hours_parts(peak)
        mean_text = hours(mean)
    else:
        axis, reference = "Times each hospital's own average", (1.0, "Each hospital's own average")
        value_text, unit_text, mean_text = f"{peak:.2f}", "times each hospital's average", "1.00"
    return Candidate(
        type="weekday", entity=entity, variant=variant, method="Kruskal-Wallis test across weekdays; epsilon-squared",
        n=n, effect_size=eps2, effect_norm=min(eps2 / full_effect, 1.0), metric_value=peak,
        unit="hours" if hospital else "ratio to own mean",
        comparison_value=mean, direction="neutral", p_value=p, passes_effect=eps2 >= float(cfg["min_epsilon_squared"]),
        completeness=min(completeness, 1.0), as_of=last, source="moh_bed_waits",
        values={**values, "weekday": WEEKDAYS[day], "pct": percent(pct), "weeks": n_weeks, "window": str(last),
                "mean": mean_text, **tie_values},
        caveats=[CAVEAT if second is None else TIE_CAVEAT, UNIT_CAVEAT, *caveats],
        evidence={"endpoint": endpoint, "query": query},
        action_key=None, action_values={**action_values, "weekday": WEEKDAYS[day]},
        chart=chart("bar", axis, points, highlight, reference=reference),
        display={"value_text": value_text, "unit_text": unit_text, "change": "up"},
        period=(first, last),
        n_unit="days", ci=ci, ci_null=mean,
    )
