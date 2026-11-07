"""Which areas have the biggest CDMP clinic shortfall for their seniors?"""
from __future__ import annotations

from datetime import date
from typing import Any

import pandas as pd

from ..model import Candidate, DetectorResult, Skip, chart, point
from ..wording import count

SQL = ("SELECT planning_area, residents_65plus, cdmp_clinics, cdmp_clinics_per_1k_seniors FROM marts.fct_area_access "
       "WHERE planning_area = '{area}'")
AXIS = "CDMP GP clinics per 1,000 residents aged 65+"
CAVEATS = ["The clinic list dates from June 2024 and residents from June 2026.",
           "Clinics are counted where they are, not where their patients live.",
           "Area averages don't describe individual people.", "Resident counts are rounded to the nearest 10."]


def detect(areas: pd.DataFrame, cfg: dict[str, Any], min_completeness: float) -> DetectorResult:
    out = DetectorResult()
    a = areas.copy()
    seniors, clinics = a["residents_65plus"], a["cdmp_clinics"]
    total_seniors = float(seniors.fillna(0).sum())
    if total_seniors <= 0:
        out.skips.append(Skip("access_gap", "all", "no resident counts"))
        return out
    national = float(clinics.fillna(0).sum()) / total_seniors          # CDMP clinics per senior, all of Singapore
    small = a[seniors.isna() | (seniors < int(cfg["min_seniors"]))]
    out.extra["excluded_areas"] = [
        {"area": r["planning_area"], "residents_65plus": None if pd.isna(r["residents_65plus"]) else int(r["residents_65plus"]),
         "reason": "no residents aged 65+" if pd.isna(r["residents_65plus"]) or r["residents_65plus"] == 0
                   else f"fewer than {int(cfg['min_seniors']):,d} residents aged 65+"}
        for _, r in small.sort_values("planning_area").iterrows()]
    out.extra["national_cdmp_per_1k_seniors"] = round(national * 1000, 4)
    inc = a.drop(small.index)
    fields = ["residents_65plus", "cdmp_clinics", "cdmp_clinics_per_1k_seniors"]
    complete = inc[fields].notna().mean(axis=1)
    for _, r in inc[complete < min_completeness].iterrows():
        out.skips.append(Skip("access_gap", r["planning_area"], f"{complete[r.name]:.0%} of its figures present"))
    inc = inc[complete >= min_completeness].copy()
    if inc.empty:
        return out
    inc["expected"] = inc["residents_65plus"] * national
    inc["shortfall"] = inc["expected"] - inc["cdmp_clinics"]
    inc["priority"] = inc["residents_65plus"].rank(pct=True) * (1 - inc["cdmp_clinics_per_1k_seniors"].rank(pct=True))
    inc = inc.sort_values(["priority", "shortfall", "planning_area"], ascending=[False, False, True])
    top = int(cfg["top"])
    for i, (_, r) in enumerate(inc.iterrows()):
        shortfall = float(r["shortfall"])
        as_of = pd.to_datetime(r.get("as_of")).date() if pd.notna(r.get("as_of")) else date.min
        rate = float(r["cdmp_clinics_per_1k_seniors"])
        points = [point("area", str(r["planning_area"]), rate), point("national", "Singapore overall", national * 1000)]
        out.candidates.append(Candidate(
            type="access_gap", entity=str(r["planning_area"]), variant="worse",
            method="Expected CDMP clinics at the national rate per senior; priority = seniors percentile x (1 - access percentile)",
            n=int(r["residents_65plus"]), effect_size=float(r["priority"]), effect_norm=float(r["priority"]),
            metric_value=rate, unit="CDMP GP clinics per 1,000 residents aged 65+",
            comparison_value=national * 1000, direction="worse", p_value=None,
            passes_effect=i < top and shortfall >= float(cfg["min_shortfall_clinics"]), completeness=1.0,
            as_of=as_of, source="datagov_chas",
            values={"area": r["planning_area"], "shortfall": count(shortfall), "shortfall_n": round(shortfall),
                    "actual": count(r["cdmp_clinics"]), "actual_n": int(r["cdmp_clinics"]), "seniors": count(r["residents_65plus"]),
                    "expected": count(r["expected"]), "window": "access", "rank": i + 1, "national": f"{national * 1000:.2f}"},
            caveats=list(CAVEATS),
            evidence={"endpoint": "/api/v1/areas/access", "query": SQL.format(area=str(r["planning_area"]).replace("'", "''"))},
            action_key=None, action_values={"area": r["planning_area"], "n_areas": max(min(top, len(inc)) - 1, 0)},
            chart=chart("bar", AXIS, points, ["area"]),
            display={"value_text": f"{rate:.2f}", "unit_text": "per 1,000 residents aged 65+",
                     "change": "down" if rate < national * 1000 else "up"},
        ))
    return out
