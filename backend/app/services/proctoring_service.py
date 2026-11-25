"""Exam proctoring: fullscreen / tab-switch violations recorded on the student's attempt.

The browser detects the events (it cannot prevent them); the server keeps the count, so a
reload or a tampered client cannot reset it. Reaching the limit terminates the attempt:
the client auto-submits, and the server accepts submissions for only a short grace period.
"""

from datetime import datetime, timezone
from typing import Dict, Iterable, Optional

from pymongo import ReturnDocument

from app.core.errors import BadRequest, Forbidden
from app.database import get_database

EVENT_TYPES = {"fullscreen_exit", "tab_hidden", "window_blur", "reentered"}
EVENT_LABELS = {"fullscreen_exit": "Left fullscreen", "tab_hidden": "Switched tab or minimised",
                "window_blur": "Clicked outside the exam", "reentered": "Re-entered the exam (reload or return)"}
MAX_EVENTS_STORED = 200
PROCTORABLE_TYPES = {"mcq", "coding", "mixed"}


def is_proctored(assessment: dict) -> bool:
    rules = assessment.get("rules") or {}
    return bool(rules.get("proctoring_enabled")) and assessment.get("assessment_type") in PROCTORABLE_TYPES


def max_violations(assessment: dict) -> int:
    return int((assessment.get("rules") or {}).get("max_violations") or 3)


def attempt_summary(attempt: Optional[dict], assessment: dict) -> Optional[dict]:
    if not attempt or not is_proctored(assessment):
        return None
    return {"violations": attempt.get("violations", 0), "max_violations": max_violations(assessment),
            "terminated": bool(attempt.get("terminated_at")), "terminated_at": attempt.get("terminated_at")}


async def record_event(student: dict, assessment: dict, event_type: str) -> dict:
    if not is_proctored(assessment):
        raise BadRequest("This assessment is not proctored")
    if event_type not in EVENT_TYPES:
        raise BadRequest("Unknown proctoring event")
    db = get_database()
    key = {"assessment_id": str(assessment["_id"]), "student_id": str(student["_id"])}
    attempt = await db.attempts.find_one(key)
    if not attempt:
        raise Forbidden("Start the assessment first")
    if attempt.get("terminated_at"):
        return attempt_summary(attempt, assessment)
    now = datetime.now(timezone.utc)
    updated = await db.attempts.find_one_and_update(
        key,
        {"$inc": {"violations": 1},
         "$push": {"proctor_events": {"$each": [{"type": event_type, "at": now}], "$slice": -MAX_EVENTS_STORED}}},
        return_document=ReturnDocument.AFTER)
    if updated.get("violations", 0) >= max_violations(assessment):
        updated = await db.attempts.find_one_and_update(
            {**key, "terminated_at": None}, {"$set": {"terminated_at": now}}, return_document=ReturnDocument.AFTER) or updated
    return attempt_summary(updated, assessment)


async def summaries_for(assessment: dict, student_ids: Iterable[str]) -> Dict[str, dict]:
    """Per-student proctoring summary with event timeline, for teacher views."""
    if not is_proctored(assessment):
        return {}
    db = get_database()
    out = {}
    async for a in db.attempts.find({"assessment_id": str(assessment["_id"]), "student_id": {"$in": list(set(student_ids))}}):
        out[a["student_id"]] = attempt_summary(a, assessment) | {
            "events": [{"type": e["type"], "label": EVENT_LABELS.get(e["type"], e["type"]), "at": e["at"]}
                       for e in a.get("proctor_events", [])]}
    return out


def flag_for(summary: Optional[dict]) -> list:
    return ["left_exam"] if summary and summary.get("violations") else []
