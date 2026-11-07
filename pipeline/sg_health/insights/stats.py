"""Statistics for the detectors. scipy does the tests; only the Mann-Kendall variance correction
for autocorrelation (Yue and Wang, 2004) is written here, on top of scipy's normal distribution."""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from scipy import stats


@dataclass
class MannKendall:
    tau: float
    s: float
    z: float
    p_value: float          # two-sided, after the autocorrelation correction
    p_value_plain: float    # two-sided, without it
    lag1: float             # lag-1 autocorrelation of the detrended series
    n_eff_ratio: float      # n / n*  (>= 1 when positive autocorrelation inflates the variance)


def mann_kendall(y: np.ndarray, *, correct: bool = True) -> MannKendall:
    """Mann-Kendall trend test with Yue-Wang effective-sample-size correction.

    The test statistic S counts concordant minus discordant pairs (time vs value). Positive
    autocorrelation makes S vary more than the independence formula assumes, so p-values come
    out too small. Yue and Wang (2004) scale Var(S) by n/n*, with n/n* from the lag-1
    autocorrelation of the series after removing its Theil-Sen trend (an AR(1) assumption).
    """
    y = np.asarray(y, dtype=float)
    n = len(y)
    if n < 4:
        raise ValueError("Mann-Kendall needs at least 4 values")
    diffs = np.sign(y[None, :] - y[:, None])
    s = float(np.triu(diffs, 1).sum())
    _, counts = np.unique(y, return_counts=True)
    var_s = (n * (n - 1) * (2 * n + 5) - float(np.sum(counts * (counts - 1) * (2 * counts + 5)))) / 18.0
    tau = float(stats.kendalltau(np.arange(n), y).statistic)

    slope = stats.theilslopes(y, np.arange(n)).slope
    resid = y - slope * np.arange(n)
    resid = resid - resid.mean()
    denom = float(np.sum(resid ** 2))
    lag1 = float(np.sum(resid[1:] * resid[:-1]) / denom) if denom > 0 else 0.0
    ratio = 1.0
    if correct and lag1 > 0:
        k = np.arange(1, n)
        ratio = 1.0 + 2.0 * float(np.sum((1 - k / n) * lag1 ** k))
    def p_for(v: float) -> tuple[float, float]:
        if v <= 0:
            return 0.0, 1.0
        z = (s - math.copysign(1, s)) / math.sqrt(v) if s != 0 else 0.0
        return z, float(2 * stats.norm.sf(abs(z)))
    z, p = p_for(var_s * ratio)
    _, p_plain = p_for(var_s)
    return MannKendall(tau=tau, s=s, z=z, p_value=p, p_value_plain=p_plain, lag1=lag1, n_eff_ratio=ratio)


def theil_sen(y: np.ndarray, x: np.ndarray | None = None) -> tuple[float, float, float, float]:
    """Slope per unit of x (default: per step), intercept, and the 95% interval of the slope."""
    y = np.asarray(y, dtype=float)
    r = stats.theilslopes(y, np.arange(len(y)) if x is None else np.asarray(x, dtype=float))
    return float(r.slope), float(r.intercept), float(r.low_slope), float(r.high_slope)


def robust_z(x: float, history: np.ndarray) -> tuple[float, float, float] | None:
    """Modified z-score 0.6745 (x - median) / MAD (Iglewicz and Hoaglin). None if MAD is 0."""
    h = np.asarray(history, dtype=float)
    med = float(np.median(h))
    mad = float(np.median(np.abs(h - med)))
    if mad == 0:
        return None
    return 0.6745 * (x - med) / mad, med, mad


def kruskal_epsilon2(groups: list[np.ndarray]) -> tuple[float, float, float]:
    """Kruskal-Wallis H, p, and epsilon-squared = H / (n - 1)."""
    h, p = stats.kruskal(*groups)
    n = sum(len(g) for g in groups)
    return float(h), float(p), float(h / (n - 1))


def spearman(x: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    r = stats.spearmanr(x, y)
    return float(r.statistic), float(r.pvalue)


def wilcoxon_median(diffs: np.ndarray) -> tuple[float, float]:
    """Median of paired differences and the Wilcoxon signed-rank p-value."""
    d = np.asarray(diffs, dtype=float)
    return float(np.median(d)), float(stats.wilcoxon(d).pvalue)


def benjamini_hochberg(p_values: list[float]) -> list[float]:
    """BH-adjusted p-values (scipy.stats.false_discovery_control), in the input order."""
    if not p_values:
        return []
    return [float(x) for x in stats.false_discovery_control(np.asarray(p_values, dtype=float), method="bh")]


def strength_label(rho: float, bounds: dict[str, float]) -> str:
    a = abs(rho)
    if a < bounds["negligible"]:
        return "negligible"
    if a < bounds["weak"]:
        return "weak"
    if a < bounds["moderate"]:
        return "moderate"
    return "strong"
