"""Assessment lifecycle: creation, status, visibility rules and student attempts."""

import random
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from bson import ObjectId
from bson.errors import InvalidId
from pymongo.errors import DuplicateKeyError

from app.core.errors import BadRequest, Forbidden, NotFound
from app.database import get_database


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _ms(dt: datetime) -> datetime:
    """MongoDB stores milliseconds; truncate so API responses match what is stored."""
    return dt.replace(microsecond=dt.microsecond // 1000 * 1000)


def make_aware(dt: Optional[datetime]) -> Optional[datetime]:
    """Treat naive datetimes as UTC (legacy documents were stored naive)."""
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def calculate_assessment_status(start_time: datetime, end_time: datetime) -> str:
    now = now_utc()
    if now < make_aware(start_time):
        return "upcoming"
    if now <= make_aware(end_time):
        return "active"
    return "ended"


def question_count(a: dict) -> int:
    return len(a.get("mcq_questions") or []) + len(a.get("coding_questions") or []) + len(a.get("manual_questions") or [])


def _with_status(a: Optional[dict]) -> Optional[dict]:
    if a:
        a["status"] = calculate_assessment_status(a["start_time"], a["end_time"])
    return a


async def validate_teacher_assignment(teacher_id: str, subject_id: str, section_ids: List[str]) -> None:
    assignment = await get_database().teacher_assignments.find_one(
        {"teacher_id": teacher_id, "subject_id": subject_id})
    if not assignment:
        raise Forbidden("You are not assigned to this subject")
    unassigned = set(section_ids) - set(assignment.get("section_ids", []))
    if unassigned:
        raise Forbidden("You are not assigned to one or more of the selected sections")


async def subject_names(subject_ids) -> Dict[str, str]:
    ids = [ObjectId(s) for s in set(subject_ids) if ObjectId.is_valid(s)]
    if not ids:
        return {}
    rows = await get_database().subjects.find({"_id": {"$in": ids}}, {"name": 1}).to_list(None)
    return {str(r["_id"]): r["name"] for r in rows}


async def create_assessment(teacher: dict, data) -> dict:
    db = get_database()
    teacher_id = str(teacher["_id"])
    now = now_utc()
    start_time = make_aware(data.start_time) if data.start_time else now
    end_time = make_aware(data.end_time)

    if data.assessment_type.value != "manual" and start_time < now - timedelta(minutes=1):
        raise BadRequest("Start time must be in the future")
    if end_time <= start_time:
        raise BadRequest("End time must be after the start time")
    if data.duration_minutes and data.assessment_type.value != "manual":
        window = (end_time - start_time).total_seconds() / 60
        if data.duration_minutes > window + 0.5:
            raise BadRequest("Duration is longer than the time window between start and end")

    if teacher.get("role") != "admin":
        await validate_teacher_assignment(teacher_id, data.subject_id, data.section_ids)

    try:
        subject = await db.subjects.find_one({"_id": ObjectId(data.subject_id)})
    except (InvalidId, TypeError):
        subject = None
    if not subject:
        raise NotFound("Subject not found")

    try:
        section_oids = [ObjectId(s) for s in data.section_ids]
    except (InvalidId, TypeError):
        raise BadRequest("Invalid section")
    sections = await db.sections.find({"_id": {"$in": section_oids}}).to_list(None)
    if len(sections) != len(set(data.section_ids)):
        raise NotFound("One or more sections were not found")
    if any(s.get("year") != subject.get("year") for s in sections):
        raise BadRequest("All sections must be in the same year as the subject")

    coding_config = data.coding_config.model_dump() if data.coding_config else None
    if data.coding_questions and not coding_config:
        coding_config = {"allowed_languages": ["python", "java", "cpp", "c"], "enable_auto_grading": True,
                         "partial_marking": True}

    doc = {
        "title": data.title.strip(),
        "description": data.description,
        "subject_id": data.subject_id,
        "section_ids": list(dict.fromkeys(data.section_ids)),
        "year": subject.get("year"),
        "assessment_type": data.assessment_type.value,
        "duration_minutes": data.duration_minutes,
        "total_marks": data.computed_total_marks,
        "start_time": start_time,
        "end_time": end_time,
        "teacher_id": teacher_id,
        "mcq_questions": [q.model_dump() for q in data.mcq_questions],
        "coding_questions": [q.model_dump() for q in data.coding_questions],
        "manual_questions": [q.model_dump() for q in data.manual_questions],
        "coding_config": coding_config,
        "rules": data.rules.model_dump(),
        "instructions": data.instructions,
        "release_questions_after_deadline": bool(data.release_questions_after_deadline),
        "created_at": now,
        "updated_at": now,
    }
    doc["_id"] = (await db.assessments.insert_one(doc)).inserted_id
    return _with_status(doc)


async def get_teacher_assessments(teacher: dict) -> List[dict]:
    query = {} if teacher.get("role") == "admin" else {"teacher_id": str(teacher["_id"])}
    rows = await get_database().assessments.find(query).sort("created_at", -1).to_list(1000)
    return [_with_status(a) for a in rows]


async def get_assessment_by_id(assessment_id: str) -> Optional[dict]:
    try:
        return _with_status(await get_database().assessments.find_one({"_id": ObjectId(assessment_id)}))
    except (InvalidId, TypeError):
        return None


async def require_assessment(assessment_id: str) -> dict:
    a = await get_assessment_by_id(assessment_id)
    if not a:
        raise NotFound("Assessment not found")
    return a


def check_student_eligible(student: dict, assessment: dict) -> None:
    if not student.get("section_id"):
        raise Forbidden("Your profile has no section assigned")
    if student["section_id"] not in assessment.get("section_ids", []):
        raise Forbidden("You are not eligible for this assessment")
    if assessment.get("year") and student.get("year") != assessment.get("year"):
        raise Forbidden("This assessment is not for your year")


async def get_student_assessments(student: dict) -> List[dict]:
    section_id, year = student.get("section_id"), student.get("year")
    if not section_id or not year:
        return []
    rows = await get_database().assessments.find(
        {"section_ids": section_id, "year": year}).sort("start_time", -1).to_list(1000)
    return [_with_status(a) for a in rows]


def _seeded(*parts: str) -> random.Random:
    return random.Random(":".join(parts))


def sanitize_for_student(a: dict, reveal_answers: bool = False, student_id: Optional[str] = None) -> dict:
    """Strip answer keys, hidden test cases, model answers and rubrics.

    With ``student_id`` and the assessment's shuffle rules, MCQ questions and/or options are
    put in a per-student order. The order is seeded by assessment + student, so it is stable
    across reloads; grading uses ids, so order never affects scores.
    """
    rules = a.get("rules") or {}
    aid = str(a.get("_id", ""))
    source = list(a.get("mcq_questions", []))
    if student_id and rules.get("shuffle_questions"):
        _seeded(aid, student_id, "questions").shuffle(source)
    mcq = []
    for q in source:
        options = [{"option_id": o["option_id"], "text": o["text"]} for o in q.get("options", [])]
        if student_id and rules.get("shuffle_options"):
            _seeded(aid, student_id, q["question_id"]).shuffle(options)
        item = {"question_id": q["question_id"], "question_text": q["question_text"],
                "options": options,
                "marks": q.get("marks", 1), "difficulty": q.get("difficulty", "medium"), "topic": q.get("topic")}
        if reveal_answers:
            item["correct_option_id"] = q.get("correct_option_id")
            item["explanation"] = q.get("explanation")
        mcq.append(item)
    coding = [{
        "question_id": q["question_id"], "title": q["title"], "problem_statement": q["problem_statement"],
        "input_format": q.get("input_format", ""), "output_format": q.get("output_format", ""),
        "constraints": q.get("constraints", ""), "sample_input": q.get("sample_input", ""),
        "sample_output": q.get("sample_output", ""), "marks": q.get("marks", 1),
        "difficulty": q.get("difficulty", "medium"), "topic": q.get("topic"),
        "time_limit_seconds": q.get("time_limit_seconds", 2),
        "public_test_cases": [{"input": t.get("input", ""), "expected_output": t.get("expected_output", "")}
                              for t in q.get("test_cases", []) if not t.get("is_hidden")][:5],
    } for q in a.get("coding_questions", [])]
    manual = [{"question_id": q.get("question_id", ""), "question_text": q.get("question_text", ""),
               "marks": q.get("marks", 1), "topic": q.get("topic"),
               "rubric": [{"criterion": c.get("criterion"), "marks": c.get("marks")} for c in q.get("rubric", [])]}
              for q in a.get("manual_questions", [])]
    return {"mcq_questions": mcq, "coding_questions": coding, "manual_questions": manual}


async def delete_assessment(assessment: dict) -> None:
    db = get_database()
    aid = str(assessment["_id"])
    if assessment["status"] != "upcoming":
        raise BadRequest("Only assessments that have not started can be deleted")
    counts = sum([await db.mcq_submissions.count_documents({"assessment_id": aid}),
                  await db.coding_submissions.count_documents({"assessment_id": aid}),
                  await db.manual_submissions.count_documents({"assessment_id": aid})])
    if counts:
        raise BadRequest("This assessment already has submissions and cannot be deleted")
    await db.assessments.delete_one({"_id": assessment["_id"]})


async def update_assessment_schedule(assessment: dict, start_time: Optional[datetime],
                                     end_time: Optional[datetime], release: Optional[bool]) -> dict:
    db = get_database()
    update: dict = {"updated_at": now_utc()}
    new_start = make_aware(start_time) if start_time else make_aware(assessment["start_time"])
    new_end = make_aware(end_time) if end_time else make_aware(assessment["end_time"])
    if start_time and assessment["status"] != "upcoming":
        raise BadRequest("The start time cannot change after the assessment has started")
    if new_end <= new_start:
        raise BadRequest("End time must be after the start time")
    if end_time:
        update["end_time"] = new_end
    if start_time:
        update["start_time"] = new_start
    if release is not None:
        update["release_questions_after_deadline"] = release
    await db.assessments.update_one({"_id": assessment["_id"]}, {"$set": update})
    return await require_assessment(str(assessment["_id"]))


# ─── Attempts (per-student timing) ────────────────────────────────────────

async def start_attempt(student: dict, assessment: dict) -> dict:
    """Record (idempotently) when a student opens a timed assessment.

    The personal deadline is ``started_at + duration``, capped at
    ``end_time + duration`` (students who start just before the window closes still
    get their full time, but nobody can begin after the window closes).
    """
    check_student_eligible(student, assessment)
    status = assessment["status"]
    if status == "upcoming":
        raise Forbidden("This assessment has not started yet")
    db = get_database()
    sid, aid = str(student["_id"]), str(assessment["_id"])
    existing = await db.attempts.find_one({"assessment_id": aid, "student_id": sid})
    if existing:
        return existing
    if status == "ended":
        raise Forbidden("This assessment has ended")
    now = _ms(now_utc())
    duration = assessment.get("duration_minutes") or 0
    end = make_aware(assessment["end_time"])
    deadline = _ms(min(now + timedelta(minutes=duration), end + timedelta(minutes=duration)) if duration else end)
    doc = {"assessment_id": aid, "student_id": sid, "started_at": now, "deadline": deadline}
    try:
        doc["_id"] = (await db.attempts.insert_one(doc)).inserted_id
    except DuplicateKeyError:
        return await db.attempts.find_one({"assessment_id": aid, "student_id": sid})
    return doc


async def check_submission_window(student: dict, assessment: dict) -> None:
    """Raise unless the student may submit right now."""
    now = now_utc()
    if now < make_aware(assessment["start_time"]):
        raise Forbidden("This assessment has not started yet")
    attempt = await get_database().attempts.find_one(
        {"assessment_id": str(assessment["_id"]), "student_id": str(student["_id"])})
    if attempt:
        # 2-minute network grace after the personal deadline.
        if now > make_aware(attempt["deadline"]) + timedelta(minutes=2):
            raise Forbidden("Your time for this assessment is over")
        return
    if now > make_aware(assessment["end_time"]) + timedelta(minutes=2):
        raise Forbidden("The submission deadline has passed")


def results_visible(assessment: dict) -> bool:
    """MCQ answer keys are shown immediately only if the teacher allowed it."""
    return bool((assessment.get("rules") or {}).get("show_result_immediately")) or assessment["status"] == "ended"
