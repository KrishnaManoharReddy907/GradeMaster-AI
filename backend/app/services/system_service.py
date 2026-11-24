"""Health checks for the database and external services (admin system-health page)."""

import asyncio
import time

import httpx

from app.core.config import settings
from app.database import get_database


async def _timed(coro):
    started = time.perf_counter()
    try:
        detail = await coro
        return {"status": "ok", "latency_ms": round((time.perf_counter() - started) * 1000), "detail": detail}
    except Exception as exc:  # noqa: BLE001
        return {"status": "down", "latency_ms": round((time.perf_counter() - started) * 1000),
                "detail": type(exc).__name__}


async def _mongo():
    await get_database().command("ping")
    return "reachable"


async def _judge0():
    headers = {}
    if settings.judge0_api_key:
        headers["X-Auth-Token"] = settings.judge0_api_key
        if settings.judge0_rapidapi_host:
            headers = {"X-RapidAPI-Key": settings.judge0_api_key, "X-RapidAPI-Host": settings.judge0_rapidapi_host}
    async with httpx.AsyncClient(timeout=6) as client:
        r = await client.get(f"{settings.judge0_api_url.rstrip('/')}/languages", headers=headers)
        r.raise_for_status()
    return "reachable"


async def _ollama():
    async with httpx.AsyncClient(timeout=3) as client:
        r = await client.get(f"{settings.ollama_host.rstrip('/')}/api/tags")
        r.raise_for_status()
    return "reachable"


async def system_health() -> dict:
    mongo, judge0, ollama = await asyncio.gather(_timed(_mongo()), _timed(_judge0()), _timed(_ollama()))
    db = get_database()
    jobs = {r["_id"]: r["n"] async for r in db.jobs.aggregate([{"$group": {"_id": "$status", "n": {"$sum": 1}}}])}
    return {
        "environment": settings.environment,
        "services": {
            "database": mongo,
            "judge0": judge0,
            "gemini": {"status": "configured" if settings.gemini_api_key else "not_configured"},
            "google_vision": {"status": "configured" if settings.google_vision_api_key else "not_configured"},
            "ollama": ollama | {"optional": True},
        },
        "llm_provider": settings.llm_provider,
        "codebert_enabled": settings.enable_codebert,
        "jobs": jobs,
    }
