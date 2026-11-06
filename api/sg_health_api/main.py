"""The FastAPI app. Run with: uvicorn --factory sg_health_api.main:create_app

The snapshot is loaded and verified in the lifespan hook, before the first request. If that
fails (or a setting is invalid) the exception propagates and uvicorn exits: the API never serves
an unverified snapshot.
"""
from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import API_VERSION, errors
from .caching import caching
from .config import Settings
from .context import Context
from .routes import build_router, warm
from .snapshot import load_snapshot

LOG = logging.getLogger(__name__)

DESCRIPTION = """Read-only access to one published, verified snapshot of the *Right-siting care in a
super-aged Singapore* data: MOH emergency department bed waits and attendances, CHAS/CDMP clinic
access for residents aged 65+ by planning area, and NUHS ED wait estimates.

Every response is `{data, meta}`. `meta.as_of` says when the figures were current; `meta.sources`,
`meta.caveats` and `meta.dq_warnings` must be shown with them. Definitions:
`docs/data_dictionary.md`."""


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()          # ConfigError here stops startup

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        snap = load_snapshot(settings)                  # SnapshotError here stops startup
        try:
            ctx = Context(snap)
            warm(ctx)
        except BaseException:
            snap.close()
            raise
        app.state.ctx = ctx
        try:
            yield
        finally:
            snap.close()

    app = FastAPI(title="sg-care-capacity API", version=API_VERSION, description=DESCRIPTION, lifespan=lifespan)
    errors.install(app)
    app.middleware("http")(caching)
    if settings.cors_allow_origins:                     # added last, so it wraps everything (304s too)
        app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_allow_origins), allow_methods=["GET"],
                           allow_headers=["If-None-Match"], expose_headers=["ETag"], allow_credentials=False)
    app.include_router(build_router())
    return app
