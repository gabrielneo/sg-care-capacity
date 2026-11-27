"""How fresh each dataset is, from docs/datasets.yml: the one config the site uses too
(web/lib/datasets.generated.ts). Ages count from the dataset's own as-of date, never a release date."""
from __future__ import annotations

import calendar
from datetime import date
from functools import cache
from typing import Any

import yaml

from . import config

DATASETS_FILE = config.REPO_ROOT / "docs" / "datasets.yml"
LEVELS = ("up_to_date", "due", "overdue")


@cache
def datasets() -> dict[str, dict[str, Any]]:
    return yaml.safe_load(DATASETS_FILE.read_text())["datasets"]


def add_span(d: date, span: dict[str, int]) -> date:
    """d plus {days: n} or {months: n} (calendar months; the 31st becomes the month's last day)."""
    if "months" in span:
        y, m = divmod(d.month - 1 + int(span["months"]), 12)
        year, month = d.year + y, m + 1
        d = date(year, month, min(d.day, calendar.monthrange(year, month)[1]))
    return date.fromordinal(d.toordinal() + int(span.get("days", 0)))


def level(source: str, as_of: date, today: date) -> str:
    """up_to_date / due / overdue for one dataset. An unknown source is judged as irregular."""
    ds = datasets().get(source) or datasets()["datagov_chas"]
    if ds.get("inherits"):
        raise ValueError(f"{source} inherits its freshness from its inputs; judge those instead")
    if today <= add_span(as_of, ds["due_after"]):
        return "up_to_date"
    return "due" if today <= add_span(as_of, ds["overdue_after"]) else "overdue"


def worst(levels: list[str]) -> str:
    """The least fresh of several levels: what a figure computed from them inherits."""
    return max(levels, key=LEVELS.index) if levels else "up_to_date"


# Datasets this pipeline should refresh every week. One of them overdue in the newest release means the pipeline or
# the source stopped (a publisher's own slow pace, e.g. CHAS on data.gov.sg, is not alarmed: the site already says it).
WATCHED_CADENCES = frozenset({"weekly", "moment"})


def overdue_sources(manifest: dict[str, Any], today: date) -> list[tuple[str, str]]:
    """(source, as_of) for each weekly or live source in a release manifest whose as_of is overdue on `today`."""
    out = []
    for source, info in sorted(manifest.get("sources", {}).items()):
        ds, as_of = datasets().get(source), (info or {}).get("as_of")
        if not ds or ds.get("cadence") not in WATCHED_CADENCES or not as_of:
            continue
        if level(source, date.fromisoformat(str(as_of)[:10]), today) == "overdue":
            out.append((source, str(as_of)))
    return out
