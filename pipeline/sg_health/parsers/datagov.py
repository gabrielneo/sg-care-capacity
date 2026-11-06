"""data.gov.sg payloads: CHAS clinics, and the annual A&E attendance series."""
from __future__ import annotations

import io
import json
import re
from typing import Optional

import pandas as pd
from bs4 import BeautifulSoup

from ..logs import ParseStats, count_drop, count_read
from .common import is_blank


def parse_annual_ae(content: bytes, series: str, stats: Optional[ParseStats] = None) -> pd.DataFrame:
    """Rows of one series from the annual admissions/attendances CSV: year, attendances, series.

    Matches the series label exactly. A missing value stays missing (NULL), never zero.
    """
    raw = pd.read_csv(io.BytesIO(content))
    needed = {"year", "level_1", "value"}
    if not needed <= set(raw.columns):
        raise ValueError(f"annual A&E CSV: expected columns {sorted(needed)}, got {list(raw.columns)}")
    rows = raw[raw["level_1"] == series]
    count_read(stats, len(rows))
    return pd.DataFrame({"year": rows["year"], "attendances": pd.to_numeric(rows["value"], errors="coerce"),
                         "series": series}).reset_index(drop=True)


def parse_datagov_metadata(payload: dict, source_by_id: dict[str, str]) -> pd.DataFrame:
    """One row from a data.gov.sg metadata response. Timestamps are converted to SGT, naive."""
    data = (payload or {}).get("data") or {}
    dataset_id = data.get("datasetId")
    if not dataset_id:
        return pd.DataFrame()

    def sgt(value):
        ts = pd.to_datetime(value, errors="coerce", utc=True)
        return None if pd.isna(ts) else ts.tz_convert("Asia/Singapore").tz_localize(None).to_pydatetime()

    return pd.DataFrame([{
        "dataset_id": dataset_id,
        "source": source_by_id.get(dataset_id),
        "dataset_name": data.get("name"),
        "managed_by": data.get("managedBy"),
        "last_updated_at": sgt(data.get("lastUpdatedAt")),
    }])


class BoundaryFormatError(ValueError):
    """The boundary file isn't laid out as expected; stop rather than guess."""


def parse_planning_areas(content: bytes, stats: Optional[ParseStats] = None) -> pd.DataFrame:
    """URA planning-area polygons: planning_area_code, planning_area_name, region_name, geometry_wkt.

    Geometry is kept as WKT text (WGS84 lon/lat) so the warehouse needs no spatial extension.
    """
    from shapely.geometry import shape

    data = json.loads(content.decode("utf-8-sig"))
    if not isinstance(data, dict) or data.get("type") != "FeatureCollection":
        raise BoundaryFormatError("expected a GeoJSON FeatureCollection")
    rows = []
    for feat in data.get("features", []):
        props = {str(k).upper(): v for k, v in (feat.get("properties") or {}).items()}
        missing = {"PLN_AREA_N", "PLN_AREA_C", "REGION_N"} - set(props)
        if missing:
            raise BoundaryFormatError(f"feature lacks {sorted(missing)}; has {sorted(props)}")
        rows.append({"planning_area_code": props["PLN_AREA_C"], "planning_area_name": props["PLN_AREA_N"],
                     "region_name": props["REGION_N"],
                     "geometry_wkt": shape(feat["geometry"]).wkt if feat.get("geometry") else None})
    count_read(stats, len(rows))
    return pd.DataFrame(rows, columns=["planning_area_code", "planning_area_name", "region_name", "geometry_wkt"])


def _html_table_to_dict(html: str) -> dict[str, str]:
    """data.gov.sg KML-style GeoJSON hides attributes inside a <th>KEY</th><td>VAL</td> table."""
    soup = BeautifulSoup(html, "lxml")
    out = {}
    for tr in soup.find_all("tr"):
        th, td = tr.find("th"), tr.find("td")
        if th and td:
            out[th.get_text(strip=True).upper()] = td.get_text(" ", strip=True)
    return out


def parse_datagov_payload(content: bytes) -> pd.DataFrame:
    """Turn a data.gov.sg download (GeoJSON, JSON records or CSV) into a flat DataFrame."""
    text = content.decode("utf-8-sig", errors="replace").strip()
    if text.startswith("{") or text.startswith("["):
        data = json.loads(text)
        if isinstance(data, dict) and data.get("type") == "FeatureCollection":
            rows = []
            for feat in data.get("features", []):
                props = {str(k).upper(): v for k, v in (feat.get("properties") or {}).items()}
                desc = props.pop("DESCRIPTION", None)
                if isinstance(desc, str) and "<t" in desc.lower():
                    props.update(_html_table_to_dict(desc))
                geom = feat.get("geometry") or {}
                if geom.get("type") == "Point" and len(geom.get("coordinates", [])) >= 2:
                    props["_LON"], props["_LAT"] = geom["coordinates"][0], geom["coordinates"][1]
                rows.append(props)
            return pd.DataFrame(rows)
        records = data.get("result", {}).get("records") if isinstance(data, dict) else data
        return pd.DataFrame(records or [])
    return pd.read_csv(io.StringIO(text))


def _first(row: pd.Series, candidates: list[str]) -> Optional[str]:
    for c in candidates:
        if c in row and not is_blank(row[c]):
            v = str(row[c]).strip()
            if not re.fullmatch(r"kml_\d+", v, re.I):   # GeoJSON placeholder names
                return v
    return None


def _unit_part(floor: Optional[str], unit: Optional[str]) -> Optional[str]:
    """'#01-23' from floor and unit. CHAS sometimes includes the '#' in FLOOR_NO already."""
    floor = (floor or "").strip().lstrip("#")
    unit = (unit or "").strip().lstrip("#")
    if floor and unit:
        return f"#{floor}-{unit}"
    if floor or unit:
        return f"#{floor or unit}"
    return None


def normalize_clinics(raw: pd.DataFrame, stats: Optional[ParseStats] = None) -> pd.DataFrame:
    """Map whatever column names the source uses onto one clinic schema."""
    count_read(stats, len(raw))
    raw = raw.rename(columns=lambda c: str(c).strip().upper())
    out = []
    for _, row in raw.iterrows():
        name = _first(row, ["HCI_NAME", "CLINIC_NAME", "NAME_OF_CLINIC", "CLINIC", "NAME"])
        address = _first(row, ["ADDRESS", "ADDR", "FULL_ADDRESS", "FORMATTED_ADDRESS"])
        if not address:
            parts = [_first(row, ["BLK_HSE_NO", "BLOCK"]), _first(row, ["STREET_NAME", "STREET"]),
                     _unit_part(_first(row, ["FLOOR_NO"]), _first(row, ["UNIT_NO"])),
                     _first(row, ["BUILDING_NAME"])]
            address = " ".join(p for p in parts if p) or None
        postal = _first(row, ["POSTAL_CD", "POSTAL_CODE", "POSTALCODE", "ADDRESSPOSTALCODE", "POSTAL"])
        if not postal and address:
            m = re.search(r"\b(\d{6})\b", address)
            postal = m.group(1) if m else None
        if postal and re.fullmatch(r"\d{5}", postal):
            postal = postal.zfill(6)                       # Excel/CSV drops leading zeros
        lat = _first(row, ["_LAT", "LATITUDE", "LAT", "Y"])
        lon = _first(row, ["_LON", "LONGITUDE", "LNG", "LON", "X"])
        programmes = _first(row, ["CLINIC_PROGRAMME_CODE", "PROGRAMME_CODE", "PROGRAMMES",
                                  "PROGRAMME", "HEALTH_PROGRAMMES"])
        hci = _first(row, ["HCI_CODE", "HCICODE"])
        out.append({
            "clinic_key": hci or f"{(name or '').upper()}|{postal or ''}",
            "clinic_name": name, "hci_code": hci, "address": address, "postal_code": postal,
            "latitude": pd.to_numeric(lat, errors="coerce"),
            "longitude": pd.to_numeric(lon, errors="coerce"),
            "programmes": programmes,
            "has_cdmp": None if programmes is None else ("CDMP" in programmes.upper()),
            # Full source row, for fields not mapped above (column lists differ between versions)
            "raw_json": json.dumps({k: (None if is_blank(v) else str(v)) for k, v in row.items()}),
        })
    df = pd.DataFrame(out)
    if df.empty:
        return df
    named = df["clinic_name"].notna()
    count_drop(stats, "missing_name", int((~named).sum()))
    # Duplicate clinic_keys are kept: the data-quality gate merges identical copies and
    # quarantines conflicting ones.
    return df[named].reset_index(drop=True)
