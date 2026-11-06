"""SingStat Table Builder JSON: flatten cells and derive 65+ residents per planning area."""
from __future__ import annotations

import re
from typing import Optional

import pandas as pd


def parse_singstat_tabledata(payload: dict, table_id: str) -> pd.DataFrame:
    """Flatten SingStat Table Builder JSON (it can be nested several levels deep)."""
    data = payload.get("Data") or payload.get("data") or {}
    rows = data.get("row") or data.get("rows") or []
    out = []

    def walk(columns: list, path: list[str], row_label: str) -> None:
        for col in columns or []:
            key = str(col.get("key", "")).strip()
            if "columns" in col and col["columns"]:
                walk(col["columns"], path + [key], row_label)
            else:
                out.append({"table_id": table_id, "row_label": row_label,
                            "column_path": " | ".join(path + [key]),
                            "value": pd.to_numeric(str(col.get("value", "")).replace(",", ""),
                                                   errors="coerce")})

    for row in rows:
        label = str(row.get("rowText", row.get("seriesNo", ""))).strip()
        walk(row.get("columns", []), [], label)
    return pd.DataFrame(out)


def derive_pop65(singstat: pd.DataFrame, title_year: Optional[int] = None) -> pd.DataFrame:
    """Best effort: sum age bands starting at 65+ for each planning area and year.

    Assumes rows are planning areas and a column-path segment is an age band such as
    '65 - 69' or '90 & Over'. Check the output against the source table.
    """
    recs = []
    for _, r in singstat.iterrows():
        segs = r["column_path"].split(" | ")
        age_lb = next((int(m.group(1)) for s in segs if (m := re.match(r"^(\d{1,3})\b", s))
                       and not re.fullmatch(r"(19|20)\d{2}", s)), None)
        year = next((int(s) for s in segs if re.fullmatch(r"(19|20)\d{2}", s)), title_year)
        if age_lb is not None and age_lb >= 65 and not pd.isna(r["value"]):
            recs.append((r["row_label"], year, r["value"]))
    if not recs:
        return pd.DataFrame(columns=["planning_area", "year", "residents_65plus"])
    df = pd.DataFrame(recs, columns=["planning_area", "year", "residents_65plus"])
    df = df[~df["planning_area"].str.lower().isin({"total", "all"})]
    return df.groupby(["planning_area", "year"], as_index=False, dropna=False)["residents_65plus"].sum()


def title_year(payload: dict) -> Optional[int]:
    """The year in a Table Builder title such as '..., June 2025', if there is one."""
    title = str((payload.get("Data") or {}).get("title", ""))
    ym = re.search(r"(19|20)\d{2}", title)
    return int(ym.group(0)) if ym else None
