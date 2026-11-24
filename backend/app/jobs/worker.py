"""Small MongoDB-backed background job queue.

Long-running work (coding evaluation against Judge0, batch evaluation) must not run
inside an HTTP request. Routes call :func:`enqueue`, return immediately with a job id,
and the UI polls ``GET /api/jobs/{id}``.

Jobs are persisted in the ``jobs`` collection, so a restart doesn't lose them: jobs
left ``running`` by a crashed process go back to ``queued`` on startup.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, Optional

from bson import ObjectId
from pymongo import ReturnDocument

from app.database import get_database

logger = logging.getLogger("grademaster.jobs")

Handler = Callable[[dict], Awaitable[Optional[dict]]]
_handlers: Dict[str, Handler] = {}
_wake = asyncio.Event()
_task: Optional[asyncio.Task] = None
_running: set = set()
CONCURRENCY = 2
MAX_ATTEMPTS = 2


def register(kind: str):
    def decorator(fn: Handler) -> Handler:
        _handlers[kind] = fn
        return fn
    return decorator


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def enqueue(kind: str, ref_id: str, payload: Optional[dict] = None,
                  created_by: Optional[str] = None) -> dict:
    """Queue a job. An identical job that is already queued/running is reused."""
    db = get_database()
    existing = await db.jobs.find_one(
        {"kind": kind, "ref_id": ref_id, "status": {"$in": ["queued", "running"]}}
    )
    if existing:
        return existing
    job = {
        "kind": kind,
        "ref_id": ref_id,
        "payload": payload or {},
        "status": "queued",
        "attempts": 0,
        "error": None,
        "result": None,
        "created_by": created_by,
        "created_at": _now(),
        "started_at": None,
        "finished_at": None,
    }
    result = await db.jobs.insert_one(job)
    job["_id"] = result.inserted_id
    _wake.set()
    return job


async def get_job(job_id: str) -> Optional[dict]:
    try:
        return await get_database().jobs.find_one({"_id": ObjectId(job_id)})
    except Exception:
        return None


def serialize_job(job: dict) -> Dict[str, Any]:
    return {
        "id": str(job["_id"]),
        "kind": job["kind"],
        "ref_id": job["ref_id"],
        "status": job["status"],
        "attempts": job.get("attempts", 0),
        "error": job.get("error"),
        "result": job.get("result"),
        "created_at": job.get("created_at"),
        "started_at": job.get("started_at"),
        "finished_at": job.get("finished_at"),
    }


async def _claim_next() -> Optional[dict]:
    return await get_database().jobs.find_one_and_update(
        {"status": "queued", "kind": {"$in": list(_handlers)}},
        {"$set": {"status": "running", "started_at": _now()}, "$inc": {"attempts": 1}},
        sort=[("created_at", 1)],
        return_document=ReturnDocument.AFTER,
    )


async def _execute(job: dict) -> None:
    from app.jobs import handlers  # noqa: F401  (ensure handlers are registered)

    db = get_database()
    handler = _handlers[job["kind"]]
    try:
        result = await handler(job)
        await db.jobs.update_one(
            {"_id": job["_id"]},
            {"$set": {"status": "done", "result": result, "error": None, "finished_at": _now()}},
        )
    except Exception as exc:  # noqa: BLE001 - job failures must never kill the worker
        logger.exception("Job %s (%s) failed", job["_id"], job["kind"])
        retry = job.get("attempts", 1) < MAX_ATTEMPTS and not getattr(exc, "permanent", False)
        await db.jobs.update_one(
            {"_id": job["_id"]},
            {"$set": {
                "status": "queued" if retry else "failed",
                "error": str(exc)[:500],
                "finished_at": None if retry else _now(),
            }},
        )
        if retry:
            _wake.set()


async def _loop() -> None:
    sem = asyncio.Semaphore(CONCURRENCY)
    while True:
        try:
            await sem.acquire()
            job = await _claim_next()
            if job is None:
                sem.release()
                _wake.clear()
                try:
                    await asyncio.wait_for(_wake.wait(), timeout=5)
                except asyncio.TimeoutError:
                    pass
                continue

            async def run(j=job):
                try:
                    await _execute(j)
                finally:
                    sem.release()

            t = asyncio.create_task(run())
            _running.add(t)
            t.add_done_callback(_running.discard)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Job loop error")
            sem.release()
            await asyncio.sleep(2)


async def start_worker() -> None:
    global _task
    # Import handler modules so they register themselves.
    from app.jobs import handlers  # noqa: F401
    await get_database().jobs.update_many(
        {"status": "running"}, {"$set": {"status": "queued", "started_at": None}}
    )
    _task = asyncio.create_task(_loop(), name="grademaster-job-worker")
    logger.info("Background job worker started (%s handlers)", len(_handlers))


async def stop_worker() -> None:
    global _task
    if _task:
        _task.cancel()
        try:
            await _task
        except (asyncio.CancelledError, Exception):
            pass
        _task = None
    for t in list(_running):
        t.cancel()


async def run_job_inline(job: dict) -> None:
    """Used by tests: execute a queued job immediately in the current task."""
    db = get_database()
    job = await db.jobs.find_one_and_update(
        {"_id": job["_id"]},
        {"$set": {"status": "running", "started_at": _now()}, "$inc": {"attempts": 1}},
        return_document=ReturnDocument.AFTER,
    )
    await _execute(job)
