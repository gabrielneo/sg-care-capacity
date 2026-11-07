"""/population: Singapore residents and the share aged 65+, by year (the sum of SingStat's planning areas)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from ..context import Context
from ..models import PopulationResponse, PopulationYear
from . import ERRORS, get_ctx

router = APIRouter(tags=["clinics and planning areas"], responses=ERRORS)

POPULATION_SQL = """
    SELECT year, max(reference_date) AS reference_date,
           sum(residents_total) FILTER (WHERE residents_total IS NOT NULL AND residents_65plus IS NOT NULL) AS residents_total,
           sum(residents_65plus) FILTER (WHERE residents_total IS NOT NULL AND residents_65plus IS NOT NULL) AS residents_65plus,
           count(*) AS planning_areas,
           count(*) FILTER (WHERE residents_total IS NOT NULL AND residents_65plus IS NOT NULL) AS planning_areas_with_figures
    FROM marts.fct_planning_area_population GROUP BY year ORDER BY year
"""
AS_OF_SQL = "SELECT max(as_of) AS as_of FROM marts.fct_planning_area_population"
CAVEATS = [
    "Residents are Singapore citizens and permanent residents, as of the end of June.",
    "The totals add up SingStat's figures for each planning area, which are rounded to the nearest 10, "
    "so they can differ slightly from SingStat's national total.",
]


@router.get("/population", response_model=PopulationResponse, summary="Residents and the share aged 65+, by year")
def population(ctx: Context = Depends(get_ctx)) -> PopulationResponse:
    if "population" not in ctx.cache:
        rows = [r for r in ctx.snap.query(POPULATION_SQL) if r["residents_total"]]
        ctx.cache["population"] = [PopulationYear(**r, share_65plus=round(r["residents_65plus"] / r["residents_total"], 6))
                                   for r in rows]
    years: list[PopulationYear] = ctx.cache["population"]
    notes = list(CAVEATS)
    missing = sum(y.planning_areas - y.planning_areas_with_figures for y in years)
    if missing:
        notes.append(f"{missing} planning {'area has' if missing == 1 else 'areas have'} no figures and "
                     f"{'is' if missing == 1 else 'are'} left out of the totals.")
    if len(years) == 1:
        notes.append("Only one year is published here, so no trend can be shown.")
    return PopulationResponse(
        data=years,
        meta=ctx.meta(as_of=ctx.snap.query(AS_OF_SQL)[0]["as_of"], sources=("singstat_residents",), caveats=notes,
                      coverage={"years": len(years)}, tables=("pop_65plus_by_area",)),
    )
