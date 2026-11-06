"""What every request needs from the snapshot, read once at startup, and the meta builder."""
from __future__ import annotations

from collections.abc import Iterable
from datetime import date, datetime
from typing import Any

from .models import DqWarning, Meta, Source
from .snapshot import Snapshot

# Display name and public page for each manifest source key. Unknown keys are still listed.
SOURCE_INFO: dict[str, tuple[str, str]] = {
    "moh_bed_waits": ("MOH, Waiting Time for Admission to Ward",
                      "https://www.moh.gov.sg/others/resources-and-statistics/"
                      "healthcare-institution-statistics-waiting-time-for-admission-to-ward/"),
    "moh_ed_attendances": ("MOH, Attendances at Emergency Medicine Departments",
                           "https://www.moh.gov.sg/others/resources-and-statistics/"
                           "healthcare-institution-statistics-attendances-at-emergency-medicine-departments/"),
    "datagov_chas": ("data.gov.sg, CHAS Clinics", "https://data.gov.sg/datasets/d_548c33ea2d99e29ec63a7cc9edcccedc/view"),
    "datagov_planning_areas": ("data.gov.sg, URA Master Plan 2025 Planning Area Boundary (No Sea)",
                               "https://data.gov.sg/datasets/d_2cc750190544007400b2cfd5d7f53209/view"),
    "datagov_polyclinics": ("data.gov.sg, HPB Cervical Screening Centres (used as the polyclinic list)",
                            "https://data.gov.sg/datasets/d_3ca2a28059588f297908b32da4ac3cbe/view"),
    "datagov_annual_ae": ("data.gov.sg, MOH Hospital Admissions and Public Sector Outpatient Attendances, Annual",
                          "https://data.gov.sg/datasets/d_a5267c58f60b20f8e04576261abfac93/view"),
    "nuhs_live": ("NUHS, Emergency Department wait times",
                  "https://www.nuhs.edu.sg/patient-care/emergency-department-wait-times"),
    "singstat_residents": ("SingStat, Singapore Residents by Planning Area / Subzone, Age Group, Sex and Type of Dwelling",
                           "https://www.singstat.gov.sg/find-data/explore-data-themes/population/"
                           "geographic-distribution/latest-news-data"),
}

LATEST_RUN_SQL = """
    SELECT check_id, "table", severity, status, failing_rows, details, run_id, checked_at, scope, blocks_publish
    FROM main.dq_results
    WHERE run_id = (SELECT run_id FROM main.dq_results ORDER BY checked_at DESC, run_id DESC LIMIT 1)
    ORDER BY severity, check_id, "table"
"""
METRICS_SQL = "SELECT metric_id, label, caveat FROM marts.dim_metric ORDER BY metric_id"
HOSPITALS_SQL = """
    SELECT hospital_code, hospital_name, cluster, facility_type, reported_from, coverage_note, exclusions_note,
           source_url, source_sha256, as_of, as_of_basis
    FROM marts.dim_hospital ORDER BY hospital_code
"""


def iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime | date):
        return value.isoformat()
    return str(value)


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


class Context:
    """Read-only, built once per snapshot. Safe to share between request threads."""

    def __init__(self, snap: Snapshot) -> None:
        self.snap = snap
        m = snap.manifest
        self.snapshot_id = snap.snapshot_id
        self.etag = f'"{self.snapshot_id}"'
        self.created_at = str(m["created_at"])
        self.sources = {key: Source(id=key, name=SOURCE_INFO.get(key, (key, ""))[0],
                                    url=SOURCE_INFO.get(key, ("", None))[1] or None,
                                    as_of=iso(v.get("as_of")), as_of_basis=v.get("as_of_basis"),
                                    last_fetched_at=iso(v.get("last_fetched_at")))
                        for key, v in sorted(m["sources"].items())}
        self.latest_run = snap.query(LATEST_RUN_SQL)
        self.metrics = {r["metric_id"]: r for r in snap.query(METRICS_SQL)}
        self.hospitals = {r["hospital_code"]: r for r in snap.query(HOSPITALS_SQL)}
        self.coverage_per_hospital: dict[str, Any] = m["coverage_per_hospital"]
        self.cache: dict[str, Any] = {}                        # static responses, built on first use

    # ------------------------------------------------------------------ meta #

    def source_list(self, keys: Iterable[str]) -> list[Source]:
        return [self.sources[k] for k in keys if k in self.sources]

    def source_as_of(self, *keys: str, oldest: bool = True) -> str | None:
        """The oldest (or newest) as_of among these sources, compared as times, not text."""
        times: list[tuple[datetime, str]] = []
        for k in keys:
            stamp = self.sources[k].as_of if k in self.sources else None
            parsed = parse_time(stamp)
            if parsed is not None and stamp is not None:
                times.append((parsed, stamp))
        if not times:
            return None
        return (min(times) if oldest else max(times))[1]

    def metric_caveats(self, *prefixes: str) -> list[str]:
        return [f"{r['label']}: {r['caveat']}" for mid, r in self.metrics.items()
                if r.get("caveat") and mid.startswith(prefixes)]

    def dq_warnings(self, tables: Iterable[str] | None) -> list[DqWarning]:
        """Findings of the latest validation run: failed checks on these tables (all tables if None)."""
        wanted = None if tables is None else set(tables)
        return [DqWarning(check_id=r["check_id"], table=r["table"], severity=r["severity"], status=r["status"],
                          failing_rows=int(r["failing_rows"] or 0), scope=r["scope"], details=r["details"] or None)
                for r in self.latest_run
                if r["status"] == "fail" and (wanted is None or r["table"] in wanted)]

    def meta(self, *, as_of: Any, sources: Iterable[str] = (), coverage: dict[str, Any] | None = None,
             caveats: Iterable[str] = (), tables: Iterable[str] | None = ()) -> Meta:
        notes = list(caveats)
        stamp = iso(as_of)
        if stamp is None:                                     # never omit as_of; say what it falls back to
            stamp = self.created_at
            notes.append("No as_of is available for these figures; as_of shows when the snapshot was created.")
        return Meta(snapshot_id=self.snapshot_id, as_of=stamp, sources=self.source_list(sources),
                    coverage=coverage, caveats=notes, dq_warnings=self.dq_warnings(tables))

    def error_meta(self) -> Meta:
        return Meta(snapshot_id=self.snapshot_id, as_of=self.created_at, sources=[], coverage=None,
                    caveats=[], dq_warnings=[])
