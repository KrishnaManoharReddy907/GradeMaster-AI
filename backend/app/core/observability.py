"""Logging setup, request-id middleware and a small in-memory rate limiter."""

import logging
import sys
import time
import uuid
from collections import defaultdict, deque
from typing import Deque, Dict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import settings


def configure_logging() -> None:
    root = logging.getLogger()
    if getattr(root, "_grademaster_configured", False):
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s", "%Y-%m-%dT%H:%M:%S")
    )
    root.handlers = [handler]
    root.setLevel(settings.log_level.upper())
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("pymongo").setLevel(logging.WARNING)
    root._grademaster_configured = True  # type: ignore[attr-defined]


access_log = logging.getLogger("grademaster.access")


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Adds an X-Request-ID header and a one-line access log per request."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        request.state.request_id = request_id
        started = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - started) * 1000
        response.headers["X-Request-ID"] = request_id
        access_log.info(
            "%s %s %s %.0fms rid=%s",
            request.method, request.url.path, response.status_code, elapsed_ms, request_id,
        )
        return response


# (path prefix, max requests, window seconds). First match wins.
RATE_LIMIT_RULES = [
    ("/api/auth/login", 10, 60),
    ("/api/auth/signup", 5, 60),
    ("/api/student/upload-handwritten", 20, 300),
    ("/api/student/process-handwritten", 20, 300),
    ("/api/student/evaluate-handwritten", 10, 300),
    ("/api/teacher/ai/", 30, 300),
    ("/api/", 300, 60),
]


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window limiter keyed by client IP + rule.

    Single-process and in-memory by design: it protects one instance from brute force
    and AI-cost abuse without needing Redis. Put a shared limiter in front of the API
    if it is ever scaled horizontally.
    """

    def __init__(self, app):
        super().__init__(app)
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):
        if not settings.rate_limit_enabled or request.method == "OPTIONS":
            return await call_next(request)
        path = request.url.path
        for prefix, limit, window in RATE_LIMIT_RULES:
            if path.startswith(prefix):
                client = request.client.host if request.client else "unknown"
                key = f"{prefix}|{client}"
                now = time.monotonic()
                hits = self._hits[key]
                while hits and now - hits[0] > window:
                    hits.popleft()
                if len(hits) >= limit:
                    retry = int(window - (now - hits[0])) + 1
                    return JSONResponse(
                        status_code=429,
                        content={"detail": "Too many requests. Please slow down.", "code": "rate_limited"},
                        headers={"Retry-After": str(retry)},
                    )
                hits.append(now)
                break
        return await call_next(request)
