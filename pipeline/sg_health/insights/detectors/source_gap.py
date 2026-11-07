"""Does NUHS's live estimate match MOH's official figure? Paired median difference, Wilcoxon signed-rank."""
from __future__ import annotations

from typing import Any

import pandas as pd

from ..model import Candidate, DetectorResult, Skip
from ..stats import wilcoxon_median
from ..wording import hours

SQL = ("-- daily median of NUHS adult estimates for NUH, joined to MOH's NUH daily median on the same date\n"
       "SELECT CAST(l.snapshot_at AS DATE) AS day, median(l.est_bed_wait_hours) AS nuhs, any_value(d.median_wait_hours) AS moh "
       "FROM marts.fct_live_ed_snapshot l JOIN marts.fct_ed_daily d ON d.hospital_code = 'NUH' "
       "AND d.report_date = CAST(l.snapshot_at AS DATE) WHERE l.hospital_code = 'NUH' AND l.is_adult_ed GROUP BY 1")


def detect(live: pd.DataFrame, daily: pd.DataFrame, cfg: dict[str, Any], full_effect: float) -> DetectorResult:
    out = DetectorResult()
    nuh = live[(live["hospital_code"] == "NUH") & live["is_adult_ed"].fillna(False).astype(bool)
               & live["est_bed_wait_hours"].notna()]
    est = nuh.assign(day=pd.to_datetime(nuh["snapshot_at"]).dt.date).groupby("day")["est_bed_wait_hours"].median()
    moh = daily[daily["hospital_code"] == "NUH"].assign(day=lambda x: pd.to_datetime(x["report_date"]).dt.date)
    moh = moh.dropna(subset=["median_wait_hours"]).set_index("day")["median_wait_hours"]
    pair = pd.concat([est.rename("nuhs"), moh.rename("moh")], axis=1, join="inner").dropna()
    need = int(cfg["min_paired_days"])
    if len(pair) < need:
        out.skips.append(Skip("source_gap", "NUH", f"{len(pair)} {'day' if len(pair) == 1 else 'days'} with both a NUHS "
                                                    f"estimate and an MOH figure; needs {need}"))
        return out
    diffs = (pair["nuhs"] - pair["moh"]).to_numpy(dtype=float)
    med, p = wilcoxon_median(diffs)
    out.candidates.append(Candidate(
        type="source_gap", entity="NUH", variant="neutral", method="Median of paired daily differences; Wilcoxon signed-rank test",
        n=len(pair), effect_size=med, effect_norm=min(abs(med) / full_effect, 1.0), metric_value=med, unit="hours",
        comparison_value=float(pair["moh"].median()), direction="neutral", p_value=p, passes_effect=True,
        completeness=1.0, as_of=max(pair.index), source="nuhs_live",
        values={"gap": hours(abs(med)), "n": f"{len(pair):,d}", "window": str(min(pair.index))},
        caveats=["The two figures measure different things: an estimate at one moment, and the day's median for admitted patients.",
                 "NUHS's figures cover its adult emergency department."],
        evidence={"endpoint": "/api/v1/live/nuhs/latest", "query": SQL},
        action_key=None, action_values={"hospital": "National University Hospital", "cluster": "NUHS"},
    ))
    return out
