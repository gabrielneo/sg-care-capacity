"""All endpoints, under /api/v1. Every response model is {data, meta}; errors share ErrorResponse."""
from __future__ import annotations

from fastapi import APIRouter, Request

from .. import API_PREFIX
from ..context import Context
from ..models import ErrorResponse

ERRORS: dict[int | str, dict] = {400: {"model": ErrorResponse, "description": "Invalid parameter"}}


def get_ctx(request: Request) -> Context:
    return request.app.state.ctx


def build_router() -> APIRouter:
    from . import ed, places, status, system

    router = APIRouter(prefix=API_PREFIX)
    for module in (system, ed, places, status):
        router.include_router(module.router)
    return router


def warm(ctx: Context) -> None:
    """Build the responses that never change for a snapshot, at startup: a bad layer or query
    fails here, before anything is served, and first requests are as fast as later ones."""
    from . import ed, places

    ctx.cache["summary"] = ed.build_summary(ctx)
    places.warm(ctx)
