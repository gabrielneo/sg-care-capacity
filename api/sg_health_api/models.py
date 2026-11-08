"""Pydantic models for every response. Each response is {data, meta}; errors are {data: null, meta, error}."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class Source(BaseModel):
    id: str = Field(description="Source key, as in the snapshot manifest")
    name: str = Field(description="Publisher and dataset")
    url: str | None = Field(description="Where the publisher makes it available")
    as_of: str | None = Field(description="When the source's figures were current (ISO 8601)")
    as_of_basis: str | None = Field(description="What as_of is based on, e.g. 'latest report_date'")
    last_fetched_at: str | None = Field(description="When the pipeline last downloaded it (SGT)")


class DqWarning(BaseModel):
    check_id: str
    table: str
    severity: Literal["ERROR", "WARN"]
    status: str = Field(description="'fail' for a check that found something")
    failing_rows: int
    scope: str = Field(description="row, file or dataset")
    details: str | None


class Meta(BaseModel):
    snapshot_id: str = Field(description="The published snapshot this response comes from (also the ETag)")
    as_of: str = Field(description="When the data in this response were current (ISO 8601, SGT)")
    sources: list[Source]
    coverage: dict[str, Any] | None = Field(description="What the response covers and what is missing")
    caveats: list[str] = Field(description="Text to show with the figures")
    dq_warnings: list[DqWarning] = Field(description="Data-quality findings on the tables behind this response")


class ErrorBody(BaseModel):
    code: str = Field(description="Machine-readable, e.g. invalid_parameter, unknown_hospital, not_found")
    message: str
    field: str | None = Field(default=None, description="The query parameter at fault, if any")


class ErrorResponse(BaseModel):
    data: None = None
    meta: Meta
    error: ErrorBody


# --------------------------------------------------------------------------- #
# /meta, /health
# --------------------------------------------------------------------------- #

class CheckSummary(BaseModel):
    blocking: int = Field(description="Checks that block publishing (always 0 in a published snapshot)")
    counts: dict[str, int] = Field(description="Check results by status")


class SnapshotInfo(BaseModel):
    snapshot_id: str
    release_tag: str | None = Field(description="GitHub release served; null for a local snapshot")
    release_url: str | None = Field(description="The GitHub release page it was downloaded from; null for a local snapshot")
    created_at: str
    pipeline_commit: str | None
    api_version: str
    row_counts: dict[str, int]
    checks: CheckSummary


class MetaResponse(BaseModel):
    data: SnapshotInfo
    meta: Meta


class Health(BaseModel):
    status: Literal["ok"]
    snapshot_id: str


class HealthResponse(BaseModel):
    data: Health
    meta: Meta


# --------------------------------------------------------------------------- #
# Hospitals and ED
# --------------------------------------------------------------------------- #

class Hospital(BaseModel):
    hospital_code: str
    hospital_name: str
    cluster: str
    facility_type: Literal["ED", "UCC"] = Field(description="AH is an Urgent Care Centre, not a full ED")
    reported_from: date | None = Field(description="First day MOH reports the site; null = from the series start")
    coverage_note: str | None
    exclusions_note: str | None
    postal_code: str | None = Field(None, description="6 digits; null in releases before 2026-11-09")
    latitude: float | None = Field(None, description="Map pin (WGS84) from SLA OneMap; null in releases before 2026-11-09")
    longitude: float | None = Field(None, description="Map pin (WGS84) from SLA OneMap; null in releases before 2026-11-09")
    source_url: str
    as_of: date
    as_of_basis: str


class HospitalsResponse(BaseModel):
    data: list[Hospital]
    meta: Meta


class EdDay(BaseModel):
    hospital_code: str
    hospital_name: str
    report_date: date
    iso_year: int
    iso_week: int
    median_wait_hours: float | None = Field(description="MOH daily median wait for a ward bed; unit inferred (hours)")
    attendances: int | None = Field(description="Patients who attended that day; null = MOH gave no value")
    is_complete_week: bool
    dq_flags: list[str] = Field(description="WARN checks this row tripped (see meta.dq_warnings)")
    wait_source_url: str | None
    wait_source_sha256: str | None
    attendance_source_url: str | None
    attendance_source_sha256: str | None
    as_of: datetime
    as_of_basis: str


class EdDailyResponse(BaseModel):
    data: list[EdDay]
    meta: Meta


class EdWeek(BaseModel):
    hospital_code: str
    hospital_name: str
    iso_year: int
    iso_week: int
    week_start: date
    week_end: date
    mean_of_daily_median_wait_hours: float | None = Field(description="Average of daily medians, NOT a weekly median")
    total_attendances: int | None = Field(description="A full-week total only when days_reported_attendances = 7")
    days_reported_wait: int
    days_reported_attendances: int
    is_complete_week: bool
    source_sha256: str | None
    as_of: datetime
    as_of_basis: str


class EdWeeklyResponse(BaseModel):
    data: list[EdWeek]
    meta: Meta


class WeekRef(BaseModel):
    iso_year: int
    iso_week: int
    week_start: date
    week_end: date


class Change(BaseModel):
    unit: str
    latest: int | float | None = Field(description="Value in the latest complete week")
    baseline_mean: float | None = Field(description="Mean over the 4 complete weeks before it; null if any is missing")
    change: float | None = Field(description="latest - baseline_mean, in the metric's unit")
    change_pct: float | None = Field(description="change / baseline_mean x 100; null if the baseline is null or 0")


class EdSummary(BaseModel):
    hospital_code: str
    hospital_name: str
    facility_type: str
    latest_complete_week: WeekRef | None = Field(description="Most recent ISO week with all 7 days of both metrics")
    is_current: bool = Field(description="False if this hospital's latest complete week is older than other hospitals'")
    baseline_weeks: list[date] = Field(description="week_start of the 4 weeks the baseline averages")
    mean_of_daily_median_wait_hours: Change
    total_attendances: Change
    note: str | None = Field(description="Why a value is missing, if one is")


class EdSummaryResponse(BaseModel):
    data: list[EdSummary]
    meta: Meta


# --------------------------------------------------------------------------- #
# Clinics and planning areas
# --------------------------------------------------------------------------- #

class Clinic(BaseModel):
    clinic_key: str
    hci_code: str | None
    clinic_name: str | None
    address: str | None
    postal_code: str | None = Field(description="6 digits, kept as text (leading zeros)")
    latitude: float | None
    longitude: float | None
    programmes: str | None = Field(description="As published, e.g. 'CDMP,CHAS'")
    has_cdmp: bool | None = Field(description="Chronic Disease Management Programme; null if programmes is missing")
    planning_area_code: str | None
    planning_area: str | None
    source_sha256: str
    as_of: datetime
    as_of_basis: str


class Polyclinic(BaseModel):
    polyclinic_name: str
    address: str | None
    postal_code: str | None = Field(description="6 digits, kept as text (leading zeros)")
    latitude: float | None
    longitude: float | None
    source_sha256: str
    as_of: datetime
    as_of_basis: str


class PolyclinicsResponse(BaseModel):
    data: list[Polyclinic]
    meta: Meta


class ClinicPage(BaseModel):
    items: list[Clinic]
    total: int = Field(description="Clinics matching the filters, across all pages")
    limit: int
    offset: int


class ClinicsResponse(BaseModel):
    data: ClinicPage
    meta: Meta


class AreaProperties(BaseModel):
    """Columns of marts.fct_area_access of the same name. Missing values are null, never 0."""
    planning_area_code: str
    planning_area: str
    region_name: str | None
    population_year: int | None
    residents_total: int | None
    residents_65plus: int | None
    chas_clinics: int | None
    cdmp_clinics: int | None
    clinics_per_1k_seniors: float | None
    cdmp_clinics_per_1k_seniors: float | None
    pct_area_within_1km_of_cdmp: float | None
    approx_km_centroid_to_nearest_polyclinic: float | None
    nearest_polyclinic: str | None
    dq_note: str | None
    as_of: str | None
    as_of_basis: str | None
    excluded_reason: str | None = Field(None, description="Why the area is left out of the access-gap ranking "
                                                          "(too few residents aged 65+); null if it is ranked")
    cdmp_shortfall: float | None = Field(None, description="CDMP clinics the national rate would give its residents "
                                                           "aged 65+, minus those it has; negative = more. Null if excluded")


class Geometry(BaseModel):
    type: Literal["Polygon", "MultiPolygon"]
    coordinates: list[Any] = Field(description="WGS84 (EPSG:4326) longitude, latitude")


class AreaFeature(BaseModel):
    type: Literal["Feature"]
    geometry: Geometry
    properties: AreaProperties


class AreaCollection(BaseModel):
    type: Literal["FeatureCollection"]
    metadata: dict[str, Any] | None = None
    features: list[AreaFeature]


class AreasResponse(BaseModel):
    data: AreaCollection
    meta: Meta


class Svy21Properties(AreaProperties):
    label_x: float = Field(description="A point inside the area for its label, in the layer's metres")
    label_y: float


class Svy21Geometry(BaseModel):
    type: Literal["Polygon", "MultiPolygon"]
    coordinates: list[Any] = Field(description="SVY21 (EPSG:3414) metres, minus metadata.origin: x east, y north")


class Svy21Feature(BaseModel):
    type: Literal["Feature"]
    geometry: Svy21Geometry
    properties: Svy21Properties


class Svy21Collection(BaseModel):
    type: Literal["FeatureCollection"]
    metadata: dict[str, Any] = Field(description="origin: the SVY21 offset subtracted from every coordinate")
    features: list[Svy21Feature]


class Svy21AreasResponse(BaseModel):
    data: Svy21Collection
    meta: Meta


# --------------------------------------------------------------------------- #
# Quality and live
# --------------------------------------------------------------------------- #

class QualityResult(BaseModel):
    check_id: str
    table: str
    severity: Literal["ERROR", "WARN"]
    status: Literal["pass", "fail", "skipped"]
    failing_rows: int
    scope: str
    blocks_publish: bool = Field(description="True for checks that stop publishing when they fail")
    details: str | None


class QualityReport(BaseModel):
    run_id: str
    checked_at: datetime
    blocking: int = Field(description="Failed checks that block publishing (0 in any published snapshot)")
    counts: dict[str, int]
    results: list[QualityResult]


class QualityResponse(BaseModel):
    data: QualityReport
    meta: Meta


class LiveReading(BaseModel):
    hospital_code: str | None = Field(description="Null if NUHS lists a site we don't recognise")
    site_name: str
    department: str
    is_adult_ed: bool | None = Field(description="Filter on this for one reading per hospital")
    measure_type: str = Field(description="Always 'estimate'")
    patients_waiting: int | None
    est_wait_to_see_doctor_hours: float | None
    est_bed_wait_hours: float | None = Field(description="NUHS estimate now; NOT MOH's daily median")
    est_wait_to_see_doctor_qualifier: Literal["<", ">"] | None = Field(
        default=None, description="'<' or '>' when NUHS published a bound ('< 1 hour(s)'): the hours are then the "
                                  "bound, not a value. Null for a plain value, and for releases before the column")
    est_bed_wait_qualifier: Literal["<", ">"] | None = Field(
        default=None, description="As est_wait_to_see_doctor_qualifier, for the bed wait")
    snapshot_at: datetime
    source_updated_at: datetime | None
    source_url: str
    source_sha256: str
    as_of: datetime
    as_of_basis: str


class LiveResponse(BaseModel):
    data: list[LiveReading]
    meta: Meta


# --------------------------------------------------------------------------- #
# Insights
# --------------------------------------------------------------------------- #

class InsightEvidence(BaseModel):
    endpoint: str = Field(description="API endpoint showing the data behind the insight")
    query: str = Field(description="SQL on the snapshot's analytics.duckdb that reproduces it")


class InsightDisplay(BaseModel):
    """What the site shows around the key number. Written by the engine; the site adds no text."""
    value_text: str = Field(description="The key number as text, rounded as in the headline, e.g. '12.7'")
    unit_text: str | None = Field(description="Its unit, e.g. 'hours'; null for a correlation")
    metric_label: str = Field(description="What the key number is, e.g. 'Average bed wait on Tuesdays'")
    comparison_label: str | None = Field(description="What it is compared with, with that value, shown after 'vs'; "
                                                     "null where the comparison isn't in the same unit")
    change: Literal["up", "down"] | None = Field(description="The arrow. Colour comes from direction, never from this")
    change_word: str | None = Field(description="The word beside the arrow, e.g. 'higher than usual'")


class InsightChartPoint(BaseModel):
    key: str
    label: str = Field(description="Axis label, e.g. 'Tue' or '19 Oct'")
    value: float | None = Field(description="Null is a gap (e.g. an incomplete week), never 0")


class InsightChartReference(BaseModel):
    value: float
    label: str = Field(description="e.g. 'Usual level', 'Weekly average'")


class InsightTrendLine(BaseModel):
    first: float = Field(description="The fitted line's value at the first point")
    last: float = Field(description="Its value at the last point")


class InsightChart(BaseModel):
    """The values the detector tested, for the site's chart (docs/insights_method.md)."""
    kind: Literal["bar", "line"]
    y_label: str
    x_label: str | None
    points: list[InsightChartPoint]
    highlight: list[str] = Field(description="Keys of the points the callout points at")
    callout: str = Field(description="The annotation pointing at the difference the headline describes")
    reference: InsightChartReference | None = Field(description="A horizontal reference line, e.g. the usual level")
    trend_line: InsightTrendLine | None = Field(description="The fitted trend line (trend only)")


class Insight(BaseModel):
    insight_id: str
    type: Literal["trend", "anomaly", "weekday", "volume_vs_wait", "access_gap", "regional", "source_gap"]
    source_ids: list[str] = Field(default_factory=list, description=(
        "The sources this finding is computed from (keys of meta.sources, each with its own as_of). An ED "
        "finding uses MOH only; an access finding uses the CHAS clinic list, SingStat and the area boundaries"))
    dq_tables: list[str] = Field(default_factory=list, description=(
        "The tables this finding is computed from: the warnings in meta.dq_warnings with these tables apply to it"))
    entity: str = Field(description="Hospital code, planning area, or 'All hospitals'")
    headline: str = Field(description="One sentence, at most 20 words, plain language")
    detail: str = Field(description="At most two sentences")
    metric_value: float | None
    unit: str
    comparison_value: float | None
    direction: Literal["better", "worse", "neutral"]
    effect_size: float | None
    p_value: float | None = Field(description="Null for descriptive detectors (no test)")
    p_adjusted: float | None = Field(description="Benjamini-Hochberg across every test in the run")
    n: int
    method: str
    caveats: list[str]
    who_acts: str | None = Field(description="Null until the author has reviewed the suggested action")
    action: str | None
    evidence: InsightEvidence
    as_of: date
    as_of_basis: str
    rank_score: float = Field(description="normalised effect x (1 - p_adjusted) x completeness x recency")
    headline_rank: int | None = Field(description="1-3 for the headline findings (at most one per detector)")
    display: InsightDisplay | None = Field(description="Null in data releases from before the engine wrote it")
    chart: InsightChart | None = Field(description="Null in data releases from before the engine wrote it")


class InsightsResponse(BaseModel):
    data: list[Insight]
    meta: Meta


class PopulationYear(BaseModel):
    """Singapore residents (citizens and permanent residents), the sum of SingStat's planning-area figures."""
    year: int
    reference_date: date = Field(description="SingStat's reference date (end of June)")
    residents_total: int
    residents_65plus: int
    share_65plus: float = Field(description="residents_65plus / residents_total, 0-1")
    planning_areas: int = Field(description="Planning areas in SingStat's table")
    planning_areas_with_figures: int = Field(description="Areas with both counts; the totals add up only these")


class PopulationResponse(BaseModel):
    data: list[PopulationYear] = Field(description="One row per year, oldest first. One row means no trend can be shown")
    meta: Meta
