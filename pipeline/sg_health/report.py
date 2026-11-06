"""Formatted Excel summary report (openpyxl)."""
from __future__ import annotations

import logging
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pandas as pd

from .parsers.common import is_blank
from .warehouse import Warehouse

LOG = logging.getLogger(__name__)

HEADER_FILL = "1F4E79"
STRIPE_FILL = "F2F4F7"


def _excel_safe(v: Any) -> Any:
    if is_blank(v) and not isinstance(v, str):
        return None
    if isinstance(v, pd.Timestamp):
        v = v.to_pydatetime()
    if isinstance(v, datetime) and v.tzinfo is not None:
        v = v.replace(tzinfo=None)
    if hasattr(v, "item") and not isinstance(v, (str, bytes)):   # numpy scalars
        try:
            return v.item()
        except (ValueError, AttributeError):
            pass
    return v


def build_excel_report(sheets: dict[str, pd.DataFrame], path: str | Path) -> Path:
    """Write the formatted report: navy header, filters, stripes, frozen header and auto-fit widths."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    wb.remove(wb.active)
    header_fill = PatternFill("solid", start_color=HEADER_FILL, end_color=HEADER_FILL)
    stripe_fill = PatternFill("solid", start_color=STRIPE_FILL, end_color=STRIPE_FILL)

    for name, df in sheets.items():
        ws = wb.create_sheet(title=name[:31])
        df = df if df is not None and not df.empty else pd.DataFrame({"status": ["No data yet"]})
        ws.append([str(c) for c in df.columns])
        for row in df.itertuples(index=False):
            ws.append([_excel_safe(v) for v in row])

        widths = {i: len(str(c)) for i, c in enumerate(df.columns, start=1)}
        for r_idx, row in enumerate(ws.iter_rows(), start=1):
            for cell in row:
                if r_idx == 1:
                    cell.fill = header_fill
                    cell.font = Font(bold=True, color="FFFFFF")
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                    continue
                if r_idx % 2 == 0:
                    cell.fill = stripe_fill
                if isinstance(cell.value, datetime):
                    cell.number_format = "yyyy-mm-dd hh:mm" if (cell.value.hour or cell.value.minute) \
                        else "yyyy-mm-dd"
                elif isinstance(cell.value, date):
                    cell.number_format = "yyyy-mm-dd"
                elif isinstance(cell.value, float):
                    cell.number_format = "0.00"
                shown = cell.value.strftime("%Y-%m-%d %H:%M") if isinstance(cell.value, datetime) \
                    else "" if cell.value is None else str(cell.value)
                widths[cell.column] = max(widths.get(cell.column, 0), len(shown))
        for col, w in widths.items():
            ws.column_dimensions[get_column_letter(col)].width = min(w + 4, 80)
        ws.auto_filter.ref = ws.dimensions
        ws.freeze_panes = "A2"

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)
    return path


def export_report(wh: Warehouse, path: str | Path) -> Path:
    summary = wh.query("""
        SELECT COALESCE(b.report_date, a.report_date)     AS report_date,
               COALESCE(b.hospital_name, a.hospital_name) AS hospital_name,
               b.median_wait_hours, a.total_attendances
        FROM moh_bed_waits b
        FULL OUTER JOIN moh_ed_attendances a
          ON a.hospital_name = b.hospital_name AND a.report_date = b.report_date
        ORDER BY report_date DESC, hospital_name""")
    chas = wh.query("""
        SELECT clinic_name, address, postal_code, latitude, longitude, has_cdmp, programmes, ingested_at
        FROM chas_clinics WHERE is_active ORDER BY clinic_name""")
    live = wh.query("""
        SELECT snapshot_timestamp, site_name, department, patients_waiting, est_consult_wait_hours,
               est_bed_wait_hours
        FROM nuhs_live_waits ORDER BY snapshot_timestamp DESC, site_name, department LIMIT 5000""")
    out = build_excel_report({"MOH_Weekly_Summary": summary, "CHAS_Clinic_Directory": chas,
                              "NUHS_Live_Snapshots": live}, path)
    LOG.info("Report written to %s", out)
    return out
