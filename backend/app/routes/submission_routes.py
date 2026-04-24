from fastapi import APIRouter, HTTPException, Depends, status
from typing import List
from datetime import datetime

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
    if current_user.get("role") in ["teacher", "faculty"] and not (current_user.get("is_approved") or current_user.get("approved")):
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


@router.get("/teacher/submissions/assessment/{assessment_id}")
async def get_assessment_submissions_route(
    assessment_id: str,
    current_user: dict = Depends(teacher_or_admin_required)
):
    """Get all submissions (MCQ + Coding) for a given assessment."""
    from app.database import get_database
    from bson import ObjectId
    db = get_database()

    submissions = []

    # Get MCQ submissions
    mcq_subs = await db.mcq_submissions.find(
        {"assessment_id": assessment_id}
    ).sort("submitted_at", -1).to_list(length=500)

    for sub in mcq_subs:
        # Try to get student info
        student = None
        try:
            student = await db.users.find_one({"_id": ObjectId(sub["student_id"])})
        except Exception:
            pass

        submissions.append({
            "id": str(sub["_id"]),
            "type": "mcq",
            "student_id": sub["student_id"],
            "student_name": student.get("name", "Unknown") if student else "Unknown",
            "student_email": student.get("email", "") if student else "",
            "assessment_id": sub["assessment_id"],
            "status": "evaluated",
            "score": sub.get("score"),
            "total_marks": sub.get("total_marks"),
            "percentage": sub.get("percentage"),
            "submitted_at": sub.get("submitted_at"),
        })

    # Get Coding submissions
    coding_subs = await db.coding_submissions.find(
        {"assessment_id": assessment_id}
    ).sort("submitted_at", -1).to_list(length=500)

    for sub in coding_subs:
        student = None
        try:
            student = await db.users.find_one({"_id": ObjectId(sub["student_id"])})
        except Exception:
            pass

        submissions.append({
            "id": str(sub["_id"]),
            "type": "coding",
            "student_id": sub["student_id"],
            "student_name": student.get("name", "Unknown") if student else "Unknown",
            "student_email": student.get("email", "") if student else "",
            "assessment_id": sub["assessment_id"],
            "question_id": sub.get("question_id"),
            "language": sub.get("language"),
            "status": sub.get("status", "pending"),
            "ai_score": sub.get("ai_score"),
            "final_score": sub.get("final_score"),
            "score": sub.get("score"),
            "max_marks": sub.get("max_marks"),
            "submitted_at": sub.get("submitted_at"),
        })

    return {"submissions": submissions, "total": len(submissions)}


@router.get("/teacher/assessment-stats")
async def get_assessment_stats_route(
    current_user: dict = Depends(teacher_or_admin_required)
):
    """Get submission counts for all of the teacher's assessments."""
    from app.database import get_database
    db = get_database()

    teacher_id = str(current_user["_id"])

    # Get all assessments by this teacher
    assessments = await db.assessments.find(
        {"teacher_id": teacher_id}
    ).to_list(length=500)

    stats = {}
    for assessment in assessments:
        aid = str(assessment["_id"])

        mcq_count = await db.mcq_submissions.count_documents({"assessment_id": aid})
        coding_count = await db.coding_submissions.count_documents({"assessment_id": aid})

        pending_count = await db.coding_submissions.count_documents(
            {"assessment_id": aid, "status": "pending"}
        )
        reviewed_count = await db.coding_submissions.count_documents(
            {"assessment_id": aid, "status": {"$in": ["reviewed", "finalized"]}}
        )

        stats[aid] = {
            "submissions_count": mcq_count + coding_count,
            "pending_count": pending_count,
            "reviewed_count": reviewed_count + mcq_count,  # MCQ is auto-evaluated
        }

    return stats
