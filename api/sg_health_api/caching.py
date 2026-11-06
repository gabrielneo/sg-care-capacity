"""ETag and Cache-Control. The data change only when a new snapshot is served, so ETag = snapshot_id.

A successful GET under /api/v1 gets `ETag: "<snapshot_id>"` and CACHE_CONTROL; a request whose
If-None-Match matches gets 304 with no body. /health and errors are never cached. max-age is an
hour (not a week) so that a new snapshot, or a changed response shape after an API deploy, is
picked up within the hour; stale-while-revalidate lets caches keep serving while they check.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import Request, Response

from . import API_PREFIX

CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400"
NO_STORE = "no-store"
UNCACHED_PATHS = {f"{API_PREFIX}/health"}


def etag_matches(header: str | None, etag: str) -> bool:
    if not header:
        return False
    for tag in header.split(","):
        tag = tag.strip()
        if tag == "*" or tag.removeprefix("W/") == etag:
            return True
    return False


async def caching(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    response = await call_next(request)
    path = request.url.path
    if not path.startswith(API_PREFIX):
        return response
    ctx = getattr(request.app.state, "ctx", None)
    if ctx is None or path in UNCACHED_PATHS or response.status_code != 200 or request.method != "GET":
        response.headers["Cache-Control"] = NO_STORE
        return response
    headers = {"ETag": ctx.etag, "Cache-Control": CACHE_CONTROL}
    if etag_matches(request.headers.get("if-none-match"), ctx.etag):
        return Response(status_code=304, headers=headers)
    response.headers.update(headers)
    return response
