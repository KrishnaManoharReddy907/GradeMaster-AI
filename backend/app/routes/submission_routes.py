from fastapi import APIRouter, HTTPException, Depends, status
from typing import List

from app.routes.auth_routes import get_current_user
from app.schemas.submission_schema import (
    MCQSubmissionCreate,
    MCQSubmissionResponse,
    CodingSubmissionCreate,
    CodingSubmissionResponse,
    SubmissionStatusResponse
)
from app.services.submission_service import (
    submit_mcq,
    submit_coding,
    get_student_submission_status
)

router = APIRouter()


async def student_required(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student access required"
        )
    return current_user


@router.post("/student/submit-mcq", response_model=MCQSubmissionResponse, status_code=status.HTTP_201_CREATED)
async def submit_mcq_route(
    data: MCQSubmissionCreate,
    current_user: dict = Depends(student_required)
):
    submission = await submit_mcq(current_user, data)

    if isinstance(submission, dict) and "error" in submission:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=submission["error"]
        )

    return MCQSubmissionResponse(
        id=str(submission["_id"]),
        assessment_id=submission["assessment_id"],
        student_id=submission["student_id"],
        score=submission["score"],
        total_marks=submission["total_marks"],
        percentage=submission["percentage"],
        submitted_at=submission["submitted_at"]
    )


@router.post("/student/submit-coding", response_model=CodingSubmissionResponse, status_code=status.HTTP_201_CREATED)
async def submit_coding_route(
    data: CodingSubmissionCreate,
    current_user: dict = Depends(student_required)
):
    submission = await submit_coding(current_user, data)

    if isinstance(submission, dict) and "error" in submission:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=submission["error"]
        )

    return CodingSubmissionResponse(
        id=str(submission["_id"]),
        assessment_id=submission["assessment_id"],
        question_id=submission["question_id"],
        student_id=submission["student_id"],
        language=submission["language"],
        status=submission["status"],
        score=submission.get("score"),
        submitted_at=submission["submitted_at"]
    )


@router.get("/student/submission-status/{assessment_id}")
async def get_submission_status_route(
    assessment_id: str,
    current_user: dict = Depends(student_required)
):
    student_id = str(current_user["_id"])
    status_data = await get_student_submission_status(student_id, assessment_id)
    return status_data
