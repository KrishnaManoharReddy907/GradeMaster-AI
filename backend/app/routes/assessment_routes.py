from datetime import datetime
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel

from app.core.deps import load_owned_assessment, require_staff, require_student
from app.core.errors import Forbidden
from app.database import get_database
from app.schemas.assessment_schema import (
    AssessmentCreate,
    AssessmentDetailResponse,
    AssessmentResponse,
    StudentAssessmentResponse,
)
from app.services import assessment_service as svc
from app.services import proctoring_service as proctor
from app.services.audit_service import record_audit

router = APIRouter()


def _summary(a: dict, names: dict) -> dict:
    return dict(
        id=str(a["_id"]), title=a["title"], description=a.get("description"),
        subject_id=a["subject_id"], subject_name=names.get(a["subject_id"]),
        section_ids=a.get("section_ids", []), assessment_type=a["assessment_type"],
        duration_minutes=a.get("duration_minutes"), total_marks=a.get("total_marks", 0),
        question_count=svc.question_count(a), start_time=a.get("start_time"), end_time=a["end_time"],
        teacher_id=a["teacher_id"], status=a["status"],
        release_questions_after_deadline=bool(a.get("release_questions_after_deadline")),
        created_at=a.get("created_at"),
    )


@router.get("/teacher/my-assignments")
async def get_my_assignments(teacher: dict = Depends(require_staff)):
    """Subjects and sections the current teacher may create assessments for."""
    db = get_database()
    query = {} if teacher.get("role") == "admin" else {"teacher_id": str(teacher["_id"])}
    assignments = await db.teacher_assignments.find(query).to_list(500)
    subject_section_map: dict = {}
    for a in assignments:
        subject_section_map.setdefault(a["subject_id"], [])
        subject_section_map[a["subject_id"]] = list(dict.fromkeys(subject_section_map[a["subject_id"]] + a.get("section_ids", [])))
    subj_ids = [ObjectId(s) for s in subject_section_map if ObjectId.is_valid(s)]
    sec_ids = [ObjectId(s) for ids in subject_section_map.values() for s in ids if ObjectId.is_valid(s)]
    subjects = await db.subjects.find({"_id": {"$in": subj_ids}}).to_list(None)
    sections = await db.sections.find({"_id": {"$in": sec_ids}}).to_list(None)
    return {
        "subjects": [{"id": str(s["_id"]), "name": s["name"], "year": s.get("year"),
                      "department_id": s.get("department_id"), "topics": s.get("topics", [])} for s in subjects],
        "sections": [{"id": str(s["_id"]), "name": s["name"], "year": s.get("year"),
                      "department_id": s.get("department_id")} for s in sections],
        "subject_section_map": subject_section_map,
    }


@router.post("/teacher/assessments", response_model=AssessmentResponse, status_code=status.HTTP_201_CREATED)
async def create_assessment_route(data: AssessmentCreate, teacher: dict = Depends(require_staff)):
    a = await svc.create_assessment(teacher, data)
    await record_audit(teacher, "assessment.create", "assessment", str(a["_id"]),
                       {"title": a["title"], "type": a["assessment_type"]})
    return AssessmentResponse(**_summary(a, await svc.subject_names([a["subject_id"]])))


@router.get("/teacher/assessments", response_model=List[AssessmentResponse])
async def get_teacher_assessments_route(teacher: dict = Depends(require_staff)):
    rows = await svc.get_teacher_assessments(teacher)
    names = await svc.subject_names(a["subject_id"] for a in rows)
    return [AssessmentResponse(**_summary(a, names)) for a in rows]


@router.get("/teacher/assessments/{assessment_id}", response_model=AssessmentDetailResponse)
async def get_teacher_assessment_detail_route(assessment_id: str, teacher: dict = Depends(require_staff)):
    a = svc._with_status(await load_owned_assessment(assessment_id, teacher))
    return AssessmentDetailResponse(
        **_summary(a, await svc.subject_names([a["subject_id"]])),
        mcq_questions=a.get("mcq_questions", []), coding_questions=a.get("coding_questions", []),
        manual_questions=a.get("manual_questions", []), coding_config=a.get("coding_config"),
        rules=a.get("rules") or {}, instructions=a.get("instructions"),
    )


class ScheduleUpdate(BaseModel):
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    release_questions_after_deadline: Optional[bool] = None


@router.patch("/teacher/assessments/{assessment_id}", response_model=AssessmentResponse)
async def update_assessment_route(assessment_id: str, data: ScheduleUpdate, teacher: dict = Depends(require_staff)):
    a = svc._with_status(await load_owned_assessment(assessment_id, teacher))
    updated = await svc.update_assessment_schedule(a, data.start_time, data.end_time,
                                                   data.release_questions_after_deadline)
    await record_audit(teacher, "assessment.update", "assessment", assessment_id, data.model_dump(exclude_none=True, mode="json"))
    return AssessmentResponse(**_summary(updated, await svc.subject_names([updated["subject_id"]])))


@router.delete("/teacher/assessments/{assessment_id}")
async def delete_assessment_route(assessment_id: str, teacher: dict = Depends(require_staff)):
    a = svc._with_status(await load_owned_assessment(assessment_id, teacher))
    await svc.delete_assessment(a)
    await record_audit(teacher, "assessment.delete", "assessment", assessment_id, {"title": a["title"]})
    return {"message": "Assessment deleted"}


# ─── Student ──────────────────────────────────────────────────────────────

@router.get("/student/assessments", response_model=List[StudentAssessmentResponse])
async def get_student_assessments_route(student: dict = Depends(require_student)):
    rows = await svc.get_student_assessments(student)
    names = await svc.subject_names(a["subject_id"] for a in rows)
    return [StudentAssessmentResponse(
        id=str(a["_id"]), title=a["title"], description=a.get("description"), subject_id=a["subject_id"],
        subject_name=names.get(a["subject_id"]), assessment_type=a["assessment_type"],
        duration_minutes=a.get("duration_minutes"), total_marks=a.get("total_marks", 0),
        question_count=svc.question_count(a), start_time=a.get("start_time"), end_time=a["end_time"],
        status=a["status"], instructions=a.get("instructions"),
        release_questions_after_deadline=bool(a.get("release_questions_after_deadline")),
    ) for a in rows]


def _student_header(a: dict, names: dict) -> dict:
    return {
        "id": str(a["_id"]), "title": a["title"], "description": a.get("description"),
        "subject_id": a["subject_id"], "subject_name": names.get(a["subject_id"]),
        "assessment_type": a["assessment_type"], "duration_minutes": a.get("duration_minutes"),
        "total_marks": a.get("total_marks", 0), "start_time": a.get("start_time"), "end_time": a.get("end_time"),
        "status": a["status"], "instructions": a.get("instructions"),
        "coding_config": a.get("coding_config"), "rules": a.get("rules") or {},
    }


@router.get("/student/assessments/{assessment_id}")
async def get_student_assessment_detail_route(assessment_id: str, student: dict = Depends(require_student)):
    """Questions without answer keys. Not available before the start time."""
    a = await svc.require_assessment(assessment_id)
    svc.check_student_eligible(student, a)
    if a["status"] == "upcoming":
        raise Forbidden("This assessment has not started yet")
    attempt = await get_database().attempts.find_one(
        {"assessment_id": assessment_id, "student_id": str(student["_id"])})
    return {**_student_header(a, await svc.subject_names([a["subject_id"]])),
            **svc.sanitize_for_student(a, student_id=str(student["_id"])),
            "attempt": {"started_at": attempt["started_at"], "deadline": attempt["deadline"],
                        "server_time": svc.now_utc(), "proctoring": proctor.attempt_summary(attempt, a)} if attempt else None}


@router.post("/student/assessments/{assessment_id}/start")
async def start_assessment_route(assessment_id: str, student: dict = Depends(require_student)):
    """Begin (or resume) a timed attempt; returns the student's personal deadline."""
    a = await svc.require_assessment(assessment_id)
    attempt = await svc.start_attempt(student, a)
    return {"started_at": attempt["started_at"], "deadline": attempt["deadline"],
            "server_time": svc.now_utc(), "proctoring": proctor.attempt_summary(attempt, a)}


class ProctorEvent(BaseModel):
    type: str


@router.post("/student/assessments/{assessment_id}/proctor-event")
async def proctor_event_route(assessment_id: str, event: ProctorEvent, student: dict = Depends(require_student)):
    """Record a fullscreen exit / tab switch. Returns the running count and whether the attempt is closed."""
    a = await svc.require_assessment(assessment_id)
    svc.check_student_eligible(student, a)
    return await proctor.record_event(student, a, event.type)


@router.get("/student/assessments/{assessment_id}/review-questions")
async def get_ended_assessment_questions_route(assessment_id: str, student: dict = Depends(require_student)):
    """Released question paper (with MCQ answers) after the deadline, if the teacher allows it."""
    a = await svc.require_assessment(assessment_id)
    svc.check_student_eligible(student, a)
    if not a.get("release_questions_after_deadline"):
        raise Forbidden("The teacher has not released the question paper for this assessment")
    if a["status"] != "ended":
        raise Forbidden("Questions can only be viewed after the assessment has ended")
    return {**_student_header(a, await svc.subject_names([a["subject_id"]])),
            **svc.sanitize_for_student(a, reveal_answers=True)}
