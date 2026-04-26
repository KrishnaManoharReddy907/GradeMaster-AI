"""
Analytics & Reports Routes

Provides analytics dashboards and PDF report downloads.
"""

from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.services.auth_service import decode_access_token, get_user_by_id
from app.services.analytics_service import get_teacher_analytics, get_student_analytics
from app.services.pdf_service import generate_student_report, generate_assessment_report

router = APIRouter()
security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    """Get current authenticated user."""
    token = credentials.credentials
    payload = decode_access_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )

    user = await get_user_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    return user


# ─── Analytics Endpoints ───────────────────────────────────────

@router.get("/analytics/teacher-dashboard")
async def teacher_dashboard(current_user: dict = Depends(get_current_user)):
    """Get teacher analytics dashboard data with Plotly charts."""
    role = current_user.get("role", "")
    if role not in ("teacher", "faculty", "hod", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can access this endpoint"
        )

    teacher_id = str(current_user["_id"])
    data = await get_teacher_analytics(teacher_id)
    return data


@router.get("/analytics/student-dashboard")
async def student_dashboard(current_user: dict = Depends(get_current_user)):
    """Get student analytics dashboard data with Plotly charts."""
    role = current_user.get("role", "")
    if role not in ("student",):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint"
        )

    student_id = str(current_user["_id"])
    data = await get_student_analytics(student_id)
    return data


# ─── PDF Report Endpoints ──────────────────────────────────────

@router.get("/reports/student/{student_id}")
async def download_student_report(
    student_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Download student performance report as PDF."""
    current_id = str(current_user["_id"])
    role = current_user.get("role", "")

    # Students can only download their own report
    if role == "student" and current_id != student_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only download your own report"
        )

    # Teachers and admins can download any student report
    if role not in ("student", "teacher", "faculty", "hod", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized"
        )

    pdf_buffer = await generate_student_report(student_id)

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=student_report_{student_id[:8]}.pdf"
        }
    )


@router.get("/reports/assessment/{assessment_id}")
async def download_assessment_report(
    assessment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Download assessment/class report as PDF."""
    role = current_user.get("role", "")

    if role not in ("teacher", "faculty", "hod", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can download assessment reports"
        )

    pdf_buffer = await generate_assessment_report(assessment_id)

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=assessment_report_{assessment_id[:8]}.pdf"
        }
    )


# ─── Per-Assessment Report Endpoint ───────────────────────────

@router.get("/analytics/assessment-report/{assessment_id}")
async def get_assessment_report(
    assessment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get detailed per-assessment report data (only available after deadline).
    Returns cached report if available, otherwise generates and caches."""
    from app.services.assessment_report_service import get_or_generate_report
    from app.database import get_database
    from bson import ObjectId
    from datetime import datetime, timezone

    role = current_user.get("role", "")
    if role not in ("teacher", "faculty", "hod", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can access assessment reports"
        )

    db = get_database()
    assessment = await db.assessments.find_one({"_id": ObjectId(assessment_id)})
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Check if deadline has passed
    end_time = assessment.get("end_time")
    if end_time:
        if end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if now < end_time:
            raise HTTPException(
                status_code=400,
                detail="Report is only available after the assessment deadline"
            )

    teacher_id = str(current_user["_id"])
    data = await get_or_generate_report(assessment_id, teacher_id)

    if "error" in data:
        raise HTTPException(status_code=403, detail=data["error"])

    return data


@router.post("/analytics/assessment-report/{assessment_id}/regenerate")
async def regenerate_assessment_report(
    assessment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Force-regenerate assessment report (re-computes stats and AI recommendations)."""
    from app.services.assessment_report_service import get_or_generate_report
    from app.database import get_database
    from bson import ObjectId
    from datetime import datetime, timezone

    role = current_user.get("role", "")
    if role not in ("teacher", "faculty", "hod", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can regenerate assessment reports"
        )

    db = get_database()
    assessment = await db.assessments.find_one({"_id": ObjectId(assessment_id)})
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    end_time = assessment.get("end_time")
    if end_time:
        if end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if now < end_time:
            raise HTTPException(
                status_code=400,
                detail="Report is only available after the assessment deadline"
            )

    teacher_id = str(current_user["_id"])
    data = await get_or_generate_report(assessment_id, teacher_id, force_regenerate=True)

    if "error" in data:
        raise HTTPException(status_code=403, detail=data["error"])

    return data

