"""Pydantic models for every response. Each response is {data, meta}; errors are {data: null, meta, error}."""
from __future__ import annotations

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
