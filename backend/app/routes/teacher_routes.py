"""
Teacher Routes

Routes for teacher review and submission management.
"""

from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from typing import Optional

from app.services.auth_service import decode_access_token, get_user_by_id
from app.services.review_service import (
    review_submission,
    finalize_submission,
    get_review_history,
    get_submission_by_id
)

router = APIRouter(prefix="/api/teacher", tags=["Teacher"])
security = HTTPBearer()


# Request schemas
class ReviewSubmissionRequest(BaseModel):
    final_score: float = Field(..., ge=0)
    teacher_feedback: Optional[str] = None


# Auth dependencies
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


# Allowed roles for teacher/evaluator access
EVALUATOR_ROLES = ["admin", "teacher", "faculty"]


async def require_teacher_or_admin(
    current_user: dict = Depends(get_current_user)
) -> dict:
    """Require teacher, faculty, or admin role."""
    role = current_user.get("role", "")
    if role not in EVALUATOR_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Teacher, faculty, or admin role required."
        )
    return current_user


# Routes
@router.post("/review/{submission_id}")
async def review_submission_route(
    submission_id: str,
    request: ReviewSubmissionRequest,
    current_user: dict = Depends(require_teacher_or_admin)
):
    """
    Review a submission and assign final score.
    
    - Requires teacher or admin role
    - Cannot modify finalized submissions
    - Tracks review history
    """
    result = await review_submission(
        submission_id=submission_id,
        teacher_id=str(current_user["_id"]),
        final_score=request.final_score,
        teacher_feedback=request.teacher_feedback
    )

    if "error" in result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result["error"]
        )

    return result


@router.post("/finalize/{submission_id}")
async def finalize_submission_route(
    submission_id: str,
    current_user: dict = Depends(require_teacher_or_admin)
):
    """
    Finalize a submission, locking it from further edits.
    
    - Requires teacher or admin role
    - Cannot be undone
    """
    result = await finalize_submission(
        submission_id=submission_id,
        teacher_id=str(current_user["_id"])
    )

    if "error" in result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result["error"]
        )

    return result


@router.get("/submission/{submission_id}")
async def get_submission_route(
    submission_id: str,
    current_user: dict = Depends(require_teacher_or_admin)
):
    """
    Get full submission details including review history.
    
    - Requires teacher or admin role
    """
    submission = await get_submission_by_id(submission_id)
    
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found"
        )

    # Convert ObjectId to string
    submission["_id"] = str(submission["_id"])

    return {
        "submission_id": submission["_id"],
        "student_id": submission.get("student_id"),
        "assessment_id": submission.get("assessment_id"),
        "question_id": submission.get("question_id"),
        "code": submission.get("code"),
        "language": submission.get("language"),
        "status": submission.get("status"),
        "ai_score": submission.get("ai_score"),
        "final_score": submission.get("final_score"),
        "max_marks": submission.get("max_marks"),
        "passed_tests": submission.get("passed_tests"),
        "total_tests": submission.get("total_tests"),
        "result_summary": submission.get("result_summary"),
        "analysis": submission.get("analysis"),
        "issues": submission.get("issues"),
        "ai_insights": submission.get("ai_insights"),
        "teacher_feedback": submission.get("teacher_feedback"),
        "reviewed_by": submission.get("reviewed_by"),
        "reviewed_at": submission.get("reviewed_at"),
        "review_history": submission.get("review_history", []),
        "submitted_at": submission.get("submitted_at"),
        "evaluated_at": submission.get("evaluated_at")
    }


@router.get("/review-history/{submission_id}")
async def get_review_history_route(
    submission_id: str,
    current_user: dict = Depends(require_teacher_or_admin)
):
    """
    Get review history for a submission.
    
    - Requires teacher or admin role
    """
    result = await get_review_history(submission_id)

    if "error" in result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=result["error"]
        )

    return result
