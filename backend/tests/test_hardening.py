"""Production-hardening behaviour: proxy-aware client IP and security headers."""

import pytest
from starlette.requests import Request

from app.core import observability
from app.core.config import settings


def _request(xff: str | None, peer: str = "10.0.0.1") -> Request:
    headers = [(b"x-forwarded-for", xff.encode())] if xff is not None else []
    return Request({"type": "http", "headers": headers, "client": (peer, 1234), "path": "/", "method": "GET"})


def test_client_ip_ignores_forwarded_header_without_trusted_proxy(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_hops", 0)
    assert observability.client_ip(_request("1.2.3.4")) == "10.0.0.1"


def test_client_ip_uses_rightmost_entry_appended_by_proxy(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
    # A client-forged first entry must not be trusted; the proxy appends the real peer last.
    assert observability.client_ip(_request("6.6.6.6, 203.0.113.9")) == "203.0.113.9"
    assert observability.client_ip(_request(None)) == "10.0.0.1"


@pytest.mark.asyncio
async def test_security_headers_present(client):
    res = await client.get("/api/health")
    assert res.status_code == 200
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in res.headers["content-security-policy"]
    assert "strict-transport-security" not in res.headers  # development


@pytest.mark.asyncio
async def test_bootstrap_token_required_when_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "bootstrap_token", "setup-token-for-tests-1234567890")
    body = {"name": "First Admin", "email": "first@x.io", "password": "abc12345"}
    setup = (await client.get("/api/admin/check-setup")).json()
    assert setup["setup_required"] and setup["token_required"]
    r = await client.post("/api/auth/bootstrap-admin", json=body)
    assert r.status_code == 403 and r.json()["code"] == "setup_token_invalid"
    r = await client.post("/api/auth/bootstrap-admin", json={**body, "setup_token": "wrong"})
    assert r.status_code == 403
    r = await client.post("/api/auth/bootstrap-admin", json={**body, "setup_token": "setup-token-for-tests-1234567890"})
    assert r.status_code == 201, r.text
    assert (await client.get("/api/admin/check-setup")).json() == {"admin_exists": True, "setup_required": False, "token_required": False}
