"""Live public wait-time pages: NUHS ED waits and SingHealth X-ray QWatch."""
from __future__ import annotations

import re
from typing import Any, Optional

import pandas as pd
from bs4 import BeautifulSoup

from ..logs import ParseStats, count_drop, count_read
from .common import parse_duration_hours, to_int

_NUHS_LABELS = {
    "patients_waiting": re.compile(r"patients?\s+waiting", re.I),
    "est_consult_wait_hours": re.compile(r"(see|to)\s+(a\s+)?doctor|consult(ation)?\s+wait", re.I),
    "est_bed_wait_hours": re.compile(r"bed\s+wait", re.I),
}


def _cell_texts(tr) -> list[str]:
    return [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]


def _label_of(text: str) -> Optional[str]:
    for key, pattern in _NUHS_LABELS.items():
        if pattern.search(text):
            return key
    return None


def _nearest_heading(node) -> Optional[str]:
    h = node.find_previous(["h1", "h2", "h3", "h4", "h5", "strong"])
    return h.get_text(" ", strip=True) if h else None


def parse_nuhs_live(html: str, stats: Optional[ParseStats] = None) -> list[dict[str, Any]]:
    """Parse the NUHS ED wait-time page into one dict per site.

    Primary strategy: look for tables with label rows (patients waiting, time to
    see a doctor, bed wait) and site-name header rows.
    Fallback: regex over the visible text if the page has no usable tables.
    """
    soup = BeautifulSoup(html, "lxml")
    text = soup.get_text("\n", strip=True)
    updated = None
    m = re.search(r"last\s+updated\s+(?:at|on)?\s*:?\s*([0-9]{1,2}\s+\w+\s+\d{4},?\s+[0-9:]+\s*[AP]M)",
                  text, re.I)
    if m:
        ts = pd.to_datetime(m.group(1).replace(",", ""), dayfirst=True, errors="coerce")
        updated = None if pd.isna(ts) else ts.to_pydatetime().replace(microsecond=0)

    results: list[dict[str, Any]] = []
    for table in soup.find_all("table"):
        rows = [_cell_texts(tr) for tr in table.find_all("tr")]
        rows = [r for r in rows if any(r)]
        header = next((r for r in rows if not _label_of(" ".join(r)) and len(r) >= 2), None)
        metrics: dict[str, list[str]] = {}
        for r in rows:
            key = _label_of(r[0]) if r else None
            if key:
                metrics[key] = r[1:]
        if not metrics:
            continue
        n_cols = max(len(v) for v in metrics.values())
        heading = _nearest_heading(table) or "NUHS ED"
        for j in range(n_cols):
            if header and len(header) > j + 1 and header[j + 1]:
                site = header[j + 1]
            elif n_cols == 1:
                site = heading
            else:
                site = f"{heading} - site {j + 1}"
            rec = {"site_name": site, "patients_waiting": None,
                   "est_consult_wait_hours": None, "est_bed_wait_hours": None}
            for key, vals in metrics.items():
                cell = vals[j] if j < len(vals) else ""
                rec[key] = to_int(cell) if key == "patients_waiting" else parse_duration_hours(cell)
            count_read(stats)
            if any(rec[k] is not None for k in _NUHS_LABELS):
                results.append(rec)
            else:
                count_drop(stats, "no_values")

    if not results:  # fallback: plain-text regex
        results = _parse_nuhs_text(text)
        count_read(stats, len(results))
    for r in results:
        r["source_updated_at"] = updated
    return results


def _parse_nuhs_text(text: str) -> list[dict[str, Any]]:
    """Text fallback: read 'Number of Patients Waiting ... 4 patient(s) 15 patient(s)' style lines."""
    flat = re.sub(r"\s+", " ", text)
    spans = []
    for key, pattern in _NUHS_LABELS.items():
        for m in pattern.finditer(flat):
            spans.append((m.start(), m.end(), key))
    spans.sort()
    sites: dict[int, dict[str, Any]] = {}
    for idx, (_, end, key) in enumerate(spans):
        stop = spans[idx + 1][0] if idx + 1 < len(spans) else min(len(flat), end + 200)
        segment = flat[end:stop]
        if key == "patients_waiting":
            values = [int(x) for x in re.findall(r"(\d+)\s*patient", segment, re.I)]
        else:
            values = [parse_duration_hours(x) for x in
                      re.findall(r"\d+(?:\.\d+)?\s*(?:hour|hr|min)[a-z()]*(?:\s*\d+\s*min[a-z()]*)?",
                                 segment, re.I)]
        for j, v in enumerate(values):
            rec = sites.setdefault(j, {"site_name": f"NUHS site {j + 1}", "patients_waiting": None,
                                       "est_consult_wait_hours": None, "est_bed_wait_hours": None})
            if rec[key] is None:
                rec[key] = v
    return list(sites.values())


def parse_singhealth_qwatch(html: str, stats: Optional[ParseStats] = None) -> list[dict[str, Any]]:
    """Parse SingHealth X-ray QWatch tables: site | total waiting time (minutes) or CLOSED."""
    soup = BeautifulSoup(html, "lxml")
    out: list[dict[str, Any]] = []
    for table in soup.find_all("table"):
        group = None
        for tr in table.find_all("tr"):
            cells = _cell_texts(tr)
            if len(cells) < 2:
                continue
            name, value = cells[0], cells[1]
            if re.search(r"waiting\s+time", value, re.I):   # header row names the group
                group = name
                continue
            count_read(stats)
            if not name or set(name) <= {"-"}:
                count_drop(stats, "missing_name")
                continue
            status = value.strip().upper() or "N/A"
            minutes = to_int(value) if re.search(r"\d", value) else None
            out.append({"site_group": group or _nearest_heading(table), "site_name": name,
                        "wait_minutes": minutes,
                        "status": "OPEN" if minutes is not None else status})
    return out
