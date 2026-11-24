"""Analytics dashboards, per-assessment AI reports and PDF downloads."""

from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.core.deps import get_current_user, is_admin, load_owned_assessment, require_staff, require_student
from app.core.errors import BadRequest, Forbidden, NotFound
from app.database import get_database
from app.services.analytics_service import (
    get_student_analytics,
    get_student_profile_for_teacher,
    get_teacher_analytics,
)
from app.services.assessment_service import calculate_assessment_status

router = APIRouter()


async def _teacher_can_see_student(teacher: dict, student_id: str) -> None:
    if is_admin(teacher):
        return
    if not ObjectId.is_valid(student_id):
        raise NotFound("Student not found")
    db = get_database()
    student = await db.users.find_one({"_id": ObjectId(student_id), "role": "student"}, {"section_id": 1})
    if not student:
        raise NotFound("Student not found")
    allowed = await db.teacher_assignments.find_one(
        {"teacher_id": str(teacher["_id"]), "section_ids": student.get("section_id")})
    if not allowed:
        raise Forbidden("This student is not in any of your sections")


def _ensure_ended(assessment: dict) -> None:
    if calculate_assessment_status(assessment["start_time"], assessment["end_time"]) != "ended":
        raise BadRequest("The report becomes available after the assessment deadline")


@router.get("/analytics/teacher-dashboard")
async def teacher_dashboard(assessment_id: Optional[str] = Query(None), teacher: dict = Depends(require_staff)):
    if assessment_id:
        await load_owned_assessment(assessment_id, teacher)
    return await get_teacher_analytics(teacher, assessment_id)


@router.get("/analytics/student-dashboard")
async def student_dashboard(student: dict = Depends(require_student)):
    return await get_student_analytics(student)


@router.get("/analytics/students/{student_id}")
async def teacher_student_profile(student_id: str, teacher: dict = Depends(require_staff)):
    await _teacher_can_see_student(teacher, student_id)
    return await get_student_profile_for_teacher(teacher, student_id)


@router.get("/reports/student/{student_id}")
async def download_student_report(student_id: str, user: dict = Depends(get_current_user)):
    from app.services.pdf_service import generate_student_report

    if user.get("role") == "student":
        if str(user["_id"]) != student_id:
            raise Forbidden("You can only download your own report")
    else:
        staff = await require_staff(user)
        await _teacher_can_see_student(staff, student_id)
    pdf = await generate_student_report(student_id)
    return StreamingResponse(pdf, media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="student_report_{student_id[-6:]}.pdf"'})


@router.get("/reports/assessment/{assessment_id}")
async def download_assessment_report(assessment_id: str, teacher: dict = Depends(require_staff)):
    from app.services.pdf_service import generate_assessment_report

    await load_owned_assessment(assessment_id, teacher)
    pdf = await generate_assessment_report(assessment_id)
    return StreamingResponse(pdf, media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="assessment_report_{assessment_id[-6:]}.pdf"'})


@router.get("/analytics/assessment-report/{assessment_id}")
async def get_assessment_report(assessment_id: str, teacher: dict = Depends(require_staff)):
    from app.services.assessment_report_service import get_or_generate_report

    assessment = await load_owned_assessment(assessment_id, teacher)
    _ensure_ended(assessment)
    data = await get_or_generate_report(assessment_id, assessment["teacher_id"])
    if "error" in data:
        raise BadRequest(data["error"])
    return data


@router.post("/analytics/assessment-report/{assessment_id}/regenerate")
async def regenerate_assessment_report(assessment_id: str, teacher: dict = Depends(require_staff)):
    from app.services.assessment_report_service import get_or_generate_report

    assessment = await load_owned_assessment(assessment_id, teacher)
    _ensure_ended(assessment)
    data = await get_or_generate_report(assessment_id, assessment["teacher_id"], force_regenerate=True)
    if "error" in data:
        raise BadRequest(data["error"])
    return data
