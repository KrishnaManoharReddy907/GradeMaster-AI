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
