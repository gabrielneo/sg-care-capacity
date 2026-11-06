"""Every error is {data: null, meta, error: {code, message, field}}, never FastAPI's default shape."""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .models import ErrorBody, ErrorResponse, Meta


class ApiError(Exception):
    """A request the API understood but won't answer (bad parameter values)."""

    def __init__(self, status: int, code: str, message: str, field: str | None = None) -> None:
        super().__init__(message)
        self.status, self.code, self.message, self.field = status, code, message, field


def _meta(request: Request) -> Meta:
    ctx = getattr(request.app.state, "ctx", None)
    if ctx is not None:
        return ctx.error_meta()
    return Meta(snapshot_id="unavailable", as_of="", sources=[], coverage=None, caveats=[], dq_warnings=[])


def error_response(request: Request, status: int, code: str, message: str, field: str | None = None) -> JSONResponse:
    body = ErrorResponse(meta=_meta(request), error=ErrorBody(code=code, message=message, field=field))
    return JSONResponse(body.model_dump(mode="json"), status_code=status)


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error(request: Request, exc: ApiError) -> JSONResponse:
        return error_response(request, exc.status, exc.code, exc.message, exc.field)

    @app.exception_handler(RequestValidationError)
    async def invalid(request: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0]
        loc = [str(p) for p in first.get("loc", ()) if p not in ("query", "path")]
        field = loc[-1] if loc else None
        message = f"{field}: {first.get('msg')}" if field else str(first.get("msg"))
        given = first.get("input")
        if field and given is not None and not isinstance(given, dict):
            message += f" (got {given!r})"
        return error_response(request, 400, "invalid_parameter", message, field)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
        message = "No such endpoint; see /docs" if exc.status_code == 404 else str(exc.detail)
        return error_response(request, exc.status_code, code, message)
