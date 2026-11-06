"""SingStat: Singapore residents by planning area, age group, sex and type of dwelling.

The file is a zip with one tidy CSV (PA, SZ, AG, Sex, TOD, Pop, Time) and a notes CSV. We sum
its cells to two tables: one row per planning area and year, and one row per subzone and year,
each with all residents and residents aged 65 and over.

The two are summed **independently** from the same cells (neither is derived from the other), so
the check that a planning area equals the sum of its subzones tests the load, not a tautology. The
file publishes no planning-area totals of its own: each cell is rounded to the nearest 10, and
SingStat's own totals elsewhere may differ from these sums by rounding.

Strict on purpose (CLAUDE.md: if a source's structure is unclear, stop): an unexpected column
or age group raises SingStatFormatError rather than being guessed at.
"""
from __future__ import annotations

import io
import zipfile

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


def read_residents_cells(content: bytes) -> tuple[pd.DataFrame, str]:
    """The published cells, checked for layout, plus the data CSV's name (the source table)."""
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
    for col in ("PA", "SZ"):
        if df[col].isna().any() or (df[col].astype(str).str.strip() == "").any():
            raise SingStatFormatError(f"{member}: {col} is blank in some rows")
    return df, member.rsplit("/", 1)[-1].removesuffix(".csv")


def _totals(cells: pd.DataFrame, keys: list[str], source_table: str, stats: ParseStats | None) -> pd.DataFrame:
    pop = cells["Pop"].astype("int64")
    frame = cells[keys].assign(residents_total=pop, residents_65plus=pop.where(cells["AG"].isin(AGED_65_PLUS), 0))
    out = (frame.groupby(keys, sort=True)[["residents_total", "residents_65plus"]].sum().reset_index()
                .rename(columns={"PA": "planning_area", "SZ": "subzone", "Time": "year"}))
    out["source_table"] = source_table
    count_read(stats, len(out))
    return out


def planning_area_totals(cells: pd.DataFrame, source_table: str, stats: ParseStats | None = None) -> pd.DataFrame:
    """One row per planning area and year: residents_total, residents_65plus, source_table."""
    return _totals(cells, ["PA", "Time"], source_table, stats)


def subzone_totals(cells: pd.DataFrame, source_table: str, stats: ParseStats | None = None) -> pd.DataFrame:
    """One row per subzone and year, with its planning area."""
    return _totals(cells, ["PA", "SZ", "Time"], source_table, stats)


def parse_residents_zip(content: bytes, stats: ParseStats | None = None) -> pd.DataFrame:
    """Planning-area totals straight from the zip."""
    return planning_area_totals(*read_residents_cells(content), stats=stats)


def parse_residents_by_subzone(content: bytes, stats: ParseStats | None = None) -> pd.DataFrame:
    """Subzone totals straight from the zip."""
    return subzone_totals(*read_residents_cells(content), stats=stats)
