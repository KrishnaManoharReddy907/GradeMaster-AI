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


def client_ip(request: Request) -> str:
    """The caller's IP. Behind ``TRUSTED_PROXY_HOPS`` reverse proxies (e.g. 1 on Render),
    read it from X-Forwarded-For counting from the right, the end proxies append to and
    clients cannot forge."""
    hops = settings.trusted_proxy_hops
    if hops > 0:
        forwarded = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
        if len(forwarded) >= hops:
            return forwarded[-hops]
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window limiter keyed by client IP + rule.

    Single-process and in-memory by design: it protects one instance from brute force
    and AI-cost abuse without needing Redis. Put a shared limiter in front of the API
    if it is ever scaled horizontally.
    """

    PRUNE_EVERY = 300.0  # seconds; drops keys idle longer than the longest window

    def __init__(self, app):
        super().__init__(app)
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)
        self._last_prune = time.monotonic()
        self._max_window = max(w for _, _, w in RATE_LIMIT_RULES)

    def _prune(self, now: float) -> None:
        if now - self._last_prune < self.PRUNE_EVERY:
            return
        self._last_prune = now
        for key in [k for k, d in self._hits.items() if not d or now - d[-1] > self._max_window]:
            del self._hits[key]

    async def dispatch(self, request: Request, call_next):
        if not settings.rate_limit_enabled or request.method == "OPTIONS":
            return await call_next(request)
        path = request.url.path
        now = time.monotonic()
        self._prune(now)
        for prefix, limit, window in RATE_LIMIT_RULES:
            if path.startswith(prefix):
                key = f"{prefix}|{client_ip(request)}"
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


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Conservative headers for a JSON/file API. HSTS only in production (HTTPS)."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        h = response.headers
        h.setdefault("X-Content-Type-Options", "nosniff")
        h.setdefault("X-Frame-Options", "DENY")
        h.setdefault("Referrer-Policy", "no-referrer")
        if not request.url.path.startswith("/api/docs"):
            h.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        if settings.is_production:
            h.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response
