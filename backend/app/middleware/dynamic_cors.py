from __future__ import annotations

from collections.abc import Awaitable, Callable

from starlette.datastructures import MutableHeaders
from starlette.responses import PlainTextResponse

from app.core.cors_state import is_origin_allowed

ASGIApp = Callable[[dict, Callable[[], Awaitable[dict]], Callable[[dict], Awaitable[None]]], Awaitable[None]]


class DynamicCORSMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Callable[[], Awaitable[dict]], send: Callable[[dict], Awaitable[None]]) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        headers = {key.decode("latin1"): value.decode("latin1") for key, value in scope.get("headers", [])}
        origin = headers.get("origin")
        method = scope.get("method", "").upper()
        has_preflight = "access-control-request-method" in headers
        origin_allowed = bool(origin) and is_origin_allowed(origin)

        if method == "OPTIONS" and has_preflight:
            if not origin_allowed:
                response = PlainTextResponse("Origin not allowed", status_code=403)
                await response(scope, receive, send)
                return
            response = PlainTextResponse("", status_code=204)
            response.headers["Access-Control-Allow-Origin"] = origin or ""
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = headers.get("access-control-request-headers", "*")
            response.headers["Vary"] = "Origin"
            await response(scope, receive, send)
            return

        async def send_wrapper(message: dict) -> None:
            if message.get("type") == "http.response.start" and origin_allowed:
                mutable_headers = MutableHeaders(scope=message)
                mutable_headers["Access-Control-Allow-Origin"] = origin or ""
                mutable_headers["Access-Control-Allow-Credentials"] = "true"
                mutable_headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
                mutable_headers["Access-Control-Allow-Headers"] = "*"
                mutable_headers["Vary"] = "Origin"
            await send(message)

        await self.app(scope, receive, send_wrapper)
