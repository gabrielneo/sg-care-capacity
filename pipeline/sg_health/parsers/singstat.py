"""SingStat: Singapore residents by planning area, age group, sex and type of dwelling.

The file is a zip with one tidy CSV (PA, SZ, AG, Sex, TOD, Pop, Time) and a notes CSV. We sum
it to one row per planning area and year: all residents, and residents aged 65 and over.

Strict on purpose (CLAUDE.md: if a source's structure is unclear, stop): an unexpected column
or age group raises SingStatFormatError rather than being guessed at.
"""
from __future__ import annotations

import io
import zipfile
from typing import Optional

import pandas as pd

from ..logs import ParseStats, count_read

EXPECTED_COLUMNS = ["PA", "SZ", "AG", "Sex", "TOD", "Pop", "Time"]
AGED_65_PLUS = ("65_to_69", "70_to_74", "75_to_79", "80_to_84", "85_to_89", "90_and_Over")
AGE_GROUPS = ("0_to_4", "5_to_9", "10_to_14", "15_to_19", "20_to_24", "25_to_29", "30_to_34", "35_to_39",
              "40_to_44", "45_to_49", "50_to_54", "55_to_59", "60_to_64", *AGED_65_PLUS)


class SingStatFormatError(ValueError):
    """The file isn't laid out as expected; stop rather than guess."""


def _data_member(z: zipfile.ZipFile) -> str:
    names = [n for n in z.namelist() if n.lower().endswith(".csv")
             and not n.rsplit("/", 1)[-1].lower().startswith("notes")]
    if len(names) != 1:
        raise SingStatFormatError(f"expected one data CSV in the zip, found {names}")
    return names[0]


def parse_residents_zip(content: bytes, stats: Optional[ParseStats] = None) -> pd.DataFrame:
    """One row per planning area and year: residents_total, residents_65plus, source_table."""
    try:
        z = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile as exc:
        raise SingStatFormatError(f"not a zip file: {exc}") from exc
    member = _data_member(z)
    df = pd.read_csv(z.open(member))
    if list(df.columns) != EXPECTED_COLUMNS:
        raise SingStatFormatError(f"{member}: expected columns {EXPECTED_COLUMNS}, got {list(df.columns)}")
    unknown = sorted(set(df["AG"].astype(str)) - set(AGE_GROUPS))
    if unknown:
        raise SingStatFormatError(f"{member}: unexpected age groups {unknown}")
    df["Pop"] = pd.to_numeric(df["Pop"], errors="coerce")
    if df["Pop"].isna().any():
        raise SingStatFormatError(f"{member}: {int(df['Pop'].isna().sum())} non-numeric resident counts")

    df["is_65plus"] = df["AG"].isin(AGED_65_PLUS)
    out = (df.groupby(["PA", "Time"], sort=True)
             .apply(lambda g: pd.Series({"residents_total": int(g["Pop"].sum()),
                                         "residents_65plus": int(g.loc[g["is_65plus"], "Pop"].sum())}),
                    include_groups=False)
             .reset_index()
             .rename(columns={"PA": "planning_area", "Time": "year"}))
    out["source_table"] = member.rsplit("/", 1)[-1].removesuffix(".csv")
    count_read(stats, len(out))
    return out
