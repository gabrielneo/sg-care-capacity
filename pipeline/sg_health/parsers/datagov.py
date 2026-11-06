"""data.gov.sg payloads: CHAS clinics."""
from __future__ import annotations

import io
import json
import re
from typing import Optional

import pandas as pd
from bs4 import BeautifulSoup

from ..logs import ParseStats, count_drop, count_read
from .common import is_blank


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
                     _first(row, ["FLOOR_NO"]) and f"#{_first(row, ['FLOOR_NO'])}-{_first(row, ['UNIT_NO']) or ''}",
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
    df = df[named]
    before = len(df)
    df = df.drop_duplicates(subset=["clinic_key"], keep="last").reset_index(drop=True)
    count_drop(stats, "duplicate_key", before - len(df))
    return df
