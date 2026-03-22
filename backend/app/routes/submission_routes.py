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
from app.services.evaluation_service import (
    evaluate_submission,
    batch_evaluate_assessment,
    get_submission_result
)

router = APIRouter()


async def student_required(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student access required"
        )
    return current_user


async def teacher_or_admin_required(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") not in ["teacher", "faculty", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teacher or Admin access required"
        )
    if current_user.get("role") in ["teacher", "faculty"] and not current_user.get("approved"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account not approved"
        )
    return current_user


@router.post("/student/submit-mcq", response_model=MCQSubmissionResponse, status_code=status.HTTP_201_CREATED)
async def submit_mcq_route(
    data: MCQSubmissionCreate,
    current_user: dict = Depends(student_required)
):
    submission = await submit_mcq(current_user, data)

    if isinstance(submission, dict) and "error" in submission:
        if submission.get("code") == "forbidden":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=submission["error"]
            )
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
        if submission.get("code") == "forbidden":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=submission["error"]
            )
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


@router.post("/teacher/evaluate/{submission_id}")
async def evaluate_submission_route(
    submission_id: str,
    current_user: dict = Depends(teacher_or_admin_required)
):
    evaluator_id = str(current_user["_id"])
    result = await evaluate_submission(submission_id, evaluator_id)

    if isinstance(result, dict) and "error" in result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result["error"]
        )

    return result


@router.post("/teacher/evaluate-assessment/{assessment_id}")
async def batch_evaluate_assessment_route(
    assessment_id: str,
    current_user: dict = Depends(teacher_or_admin_required)
):
    evaluator_id = str(current_user["_id"])
    result = await batch_evaluate_assessment(assessment_id, evaluator_id)
    return result


@router.get("/teacher/submission/{submission_id}")
async def get_submission_detail_route(
    submission_id: str,
    current_user: dict = Depends(teacher_or_admin_required)
):
    result = await get_submission_result(submission_id)

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found"
        )

    return result


@router.get("/student/submission/{submission_id}")
async def get_student_submission_detail_route(
    submission_id: str,
    current_user: dict = Depends(student_required)
):
    student_id = str(current_user["_id"])
    result = await get_submission_result(submission_id)

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found"
        )

    if result["student_id"] != student_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own submissions"
        )

    if result.get("test_results"):
        result["test_results"] = [
            {k: v for k, v in tr.items() if not tr.get("is_hidden") or k in ["test_case_index", "passed", "is_hidden"]}
            for tr in result["test_results"]
        ]

    return result
