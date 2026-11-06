"""The load gate: validate parsed rows before they reach a clean table.

    parsed rows ──► gate(table) ─┬─► clean rows (returned; the caller upserts them)
                                 ├─► quarantine_<table>   rows that failed an ERROR check
                                 └─► dq_findings          every failure, ERROR or WARN

The gate never changes a value. A row either passes through untouched or is withheld.

State is kept "current", per key: when a file is gated, earlier findings and quarantine
rows for the same keys are replaced by this file's results. So if a later file brings a
good value for a key, its old quarantine row is cleared; if a later file brings a bad
value, it is quarantined and the clean table keeps the last good value. File-level
findings describe the latest file gated for the table.
"""
from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING

import pandas as pd

from ..logs import ParseStats
from ..raw import RawRecord
from ..warehouse import TABLE_KEYS
from .model import CHECKS, Finding, Scope, Severity, key_json, register

if TYPE_CHECKING:
    from ..warehouse import Warehouse

LOG = logging.getLogger(__name__)

LINEAGE = ("source_url", "source_sha256", "ingested_at")

REQUIRED_COLUMNS = register(
    "schema.required_columns", Severity.ERROR, Scope.FILE,
    "Every NOT NULL column of the table is present in the parsed rows", tables=tuple(TABLE_KEYS))
REQUIRED_VALUES = register(
    "schema.required_values", Severity.ERROR, Scope.ROW,
    "NOT NULL columns have a value", tables=tuple(TABLE_KEYS))
TYPES = register(
    "schema.types", Severity.ERROR, Scope.ROW,
    "Every value can be stored as its column's type", tables=tuple(TABLE_KEYS))
DUPLICATE_KEY = register(
    "schema.duplicate_key", Severity.ERROR, Scope.ROW,
    "No two rows in one file share a primary key with different values", tables=tuple(TABLE_KEYS))


@dataclass
class GateContext:
    wh: Warehouse                     # imported for type checking only, to avoid a cycle
    table: str
    keys: list[str]
    rec: RawRecord
    stats: ParseStats
    attrs: dict | None = None          # parser notes about the file (DataFrame.attrs)


# A rule returns (check_id, failing-row mask, detail). detail is a str for the whole mask,
# or a Series of per-row strings. A file-level rule may return an int instead of a mask: a
# count of problems that cover no stored rows (e.g. a spreadsheet column that was ignored).
RuleResult = tuple[str, pd.Series, "str | pd.Series"]
Rule = Callable[[pd.DataFrame, GateContext], list[RuleResult]]
TABLE_RULES: dict[str, list[Rule]] = {}


def rule(*tables: str):
    """Decorator: register a rule for one or more tables."""
    def deco(fn: Rule) -> Rule:
        for t in tables:
            TABLE_RULES.setdefault(t, []).append(fn)
        return fn
    return deco


# --------------------------------------------------------------------------- #
# Generic schema checks
# --------------------------------------------------------------------------- #

def _bad_type_mask(series: pd.Series, duck_type: str) -> pd.Series:
    """True where a non-null value cannot be stored as duck_type. Never modifies the data."""
    present = series.notna()
    t = duck_type.upper()
    if t in ("DATE", "TIMESTAMP") or t.startswith("TIMESTAMP"):
        converted = pd.to_datetime(series.where(present), errors="coerce")
    elif t in ("DOUBLE", "FLOAT", "REAL") or t.startswith("DECIMAL"):
        converted = pd.to_numeric(series.where(present), errors="coerce")
    elif t in ("BIGINT", "INTEGER", "SMALLINT", "TINYINT", "HUGEINT"):
        num = pd.to_numeric(series.where(present), errors="coerce")
        converted = num.where((num.isna()) | (num.astype("float64") % 1 == 0))
    elif t == "BOOLEAN":
        converted = series.where(series.map(lambda v: isinstance(v, bool) or v in (0, 1)))
    else:                                   # VARCHAR and friends accept anything
        return pd.Series(False, index=series.index)
    return present & converted.isna()


def _schema_results(df: pd.DataFrame, ctx: GateContext, types: dict[str, str],
                    required: list[str]) -> tuple[list[RuleResult], pd.Series]:
    """Generic checks. Returns (results, mask of identical duplicate rows to drop silently)."""
    results: list[RuleResult] = []
    no = pd.Series(False, index=df.index)

    bad = no.copy()
    detail = pd.Series("", index=df.index)
    for col in [c for c in df.columns if c in types]:
        m = _bad_type_mask(df[col], types[col])
        if m.any():
            bad |= m
            detail = detail.where(~m, detail + col + "=" + df[col].astype(str) + f" is not {types[col]}; ")
    results.append((TYPES.check_id, bad, detail.str.rstrip("; ")))

    nulls = df[required].isna()
    results.append((REQUIRED_VALUES.check_id, nulls.any(axis=1),
                    nulls.apply(lambda r: "missing " + ", ".join(c for c in required if r[c]), axis=1)
                    if len(df) else pd.Series(dtype=str)))

    dup_any = df.duplicated(ctx.keys, keep=False)
    conflict, drop_identical = no.copy(), no.copy()
    if dup_any.any():
        cmp_cols = [c for c in df.columns if c in types and c not in LINEAGE and c not in ctx.keys]
        groups = df[dup_any].groupby(ctx.keys, dropna=False, sort=False)
        distinct = groups[cmp_cols].nunique(dropna=False).max(axis=1) if cmp_cols else None
        for key, n_distinct in (distinct.items() if distinct is not None else []):
            key = key if isinstance(key, tuple) else (key,)
            in_group = dup_any.copy()
            for col, val in zip(ctx.keys, key):
                in_group &= df[col].eq(val) | (df[col].isna() & pd.isna(val))
            if n_distinct > 1:
                conflict |= in_group
            else:                            # same values twice: keep the first copy
                drop_identical |= in_group & df.duplicated(ctx.keys, keep="first")
    results.append((DUPLICATE_KEY.check_id, conflict, "same key, different values in one file"))
    return results, drop_identical


# --------------------------------------------------------------------------- #
# The gate
# --------------------------------------------------------------------------- #

def gate(df: pd.DataFrame, ctx: GateContext) -> pd.DataFrame:
    """Validate ``df`` (parsed rows plus lineage) for ``ctx.table``. Returns the clean rows."""
    wh = ctx.wh
    if df is None or df.empty:
        return df
    ctx.attrs = dict(df.attrs)
    df = df.reset_index(drop=True)
    types = wh.column_types(ctx.table)
    required = [c for c in wh.not_null_columns(ctx.table) if c not in LINEAGE]

    missing = [c for c in required if c not in df.columns]
    if missing:
        f = Finding(REQUIRED_COLUMNS.check_id, ctx.table, f"missing columns {missing}",
                    extra={"failing_rows": len(df)})
        LOG.error("%s: parsed rows lack required columns %s; whole file quarantined (%s)",
                  ctx.table, missing, ctx.rec.url)
        _persist(df, pd.Series(True, index=df.index), [], [f], ctx)
        ctx.stats.drop("quarantined", len(df))
        return df.iloc[0:0]

    results, drop_identical = _schema_results(df, ctx, types, required)
    for fn in TABLE_RULES.get(ctx.table, []):
        results.extend(fn(df, ctx))

    error = pd.Series(False, index=df.index)
    row_findings: list[Finding] = []
    file_findings: list[Finding] = []
    for check_id, mask, detail in results:
        check = CHECKS[check_id]
        if isinstance(mask, int):           # file-level problem that covers no stored rows
            if mask:
                file_findings.append(Finding(check_id, ctx.table, str(detail), extra={"failing_rows": mask}))
                (LOG.error if check.severity is Severity.ERROR else LOG.warning)(
                    "%s %s: %s (%s)", check_id, ctx.table, detail, ctx.rec.url)
            continue
        mask = mask.reindex(df.index, fill_value=False).fillna(False).astype(bool)
        if not mask.any():
            continue
        if check.severity is Severity.ERROR:
            error |= mask
        if check.scope is Scope.ROW:
            for i in df.index[mask]:
                text = detail.loc[i] if isinstance(detail, pd.Series) else detail
                row_findings.append(Finding(check_id, ctx.table, str(text), row_key=_key(df, i, ctx.keys)))
        else:
            file_findings.append(Finding(check_id, ctx.table, str(detail),
                                         extra={"failing_rows": int(mask.sum())}))
            log = LOG.error if check.severity is Severity.ERROR else LOG.warning
            log("%s %s: %s (%d rows, %s)", check_id, ctx.table, detail, int(mask.sum()), ctx.rec.url)

    keep = ~drop_identical
    ctx.stats.drop("duplicate_key", int(drop_identical.sum()))
    quarantined = error & keep
    ctx.stats.drop("quarantined", int(quarantined.sum()))
    _persist(df[keep], quarantined[keep], row_findings, file_findings, ctx)
    return df[keep & ~error]


def _key(df: pd.DataFrame, i, keys: list[str]) -> dict:
    """Primary key of row i. A key column missing from the parse is recorded as None."""
    return {k: (df.at[i, k] if k in df.columns else None) for k in keys}


def _persist(df: pd.DataFrame, quarantined: pd.Series, row_findings: list[Finding],
             file_findings: list[Finding], ctx: GateContext) -> None:
    """Replace this batch's keys in quarantine and dq_findings; replace file-level findings."""
    wh = ctx.wh
    batch_keys = pd.DataFrame({"row_key": [key_json(_key(df, i, ctx.keys)) for i in df.index]})
    wh.replace_batch_state(ctx.table, batch_keys, ctx.rec)

    q = df[quarantined]
    if len(q):
        reasons: dict[str, list[str]] = {}
        details: dict[str, list[str]] = {}
        for f in row_findings + file_findings:
            if f.check.severity is not Severity.ERROR:
                continue
            if f.row_key is None:            # file-level ERROR covers every quarantined row
                for i in q.index:
                    k = key_json(_key(q, i, ctx.keys))
                    reasons.setdefault(k, []).append(f.check_id)
                    details.setdefault(k, []).append(f.detail)
            else:
                k = key_json(f.row_key)
                reasons.setdefault(k, []).append(f.check_id)
                details.setdefault(k, []).append(f.detail)
        qrows = q.copy()
        qrows.insert(0, "row_key", [key_json(_key(q, i, ctx.keys)) for i in q.index])
        qrows.insert(1, "check_ids", qrows["row_key"].map(lambda k: ",".join(sorted(set(reasons.get(k, []))))))
        qrows.insert(2, "details", qrows["row_key"].map(lambda k: " | ".join(details.get(k, []))))
        wh.insert_quarantine(ctx.table, qrows)
    wh.insert_findings(row_findings + file_findings, ctx.rec)
