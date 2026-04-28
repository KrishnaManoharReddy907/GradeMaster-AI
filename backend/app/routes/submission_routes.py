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


@router.get("/student/all-submissions")
async def get_all_student_submissions_route(
    current_user: dict = Depends(student_required)
):
    """Get all submissions for the current student across all assessments (past & present)."""
    from app.database import get_database
    from bson import ObjectId
    db = get_database()

    student_id = str(current_user["_id"])

    # Fetch all submissions
    mcq_subs = await db.mcq_submissions.find({"student_id": student_id}).sort("submitted_at", -1).to_list(100)
    coding_subs = await db.coding_submissions.find({"student_id": student_id}).sort("submitted_at", -1).to_list(100)
    manual_subs = await db.manual_submissions.find({"student_id": student_id}).sort("submitted_at", -1).to_list(100)

    # Collect unique assessment IDs
    assessment_ids = set()
    for s in mcq_subs:
        assessment_ids.add(s["assessment_id"])
    for s in coding_subs:
        assessment_ids.add(s["assessment_id"])
    for s in manual_subs:
        assessment_ids.add(s["assessment_id"])

    # Fetch assessment info (title, type) for each
    assessment_map = {}
    for aid in assessment_ids:
        try:
            a = await db.assessments.find_one({"_id": ObjectId(aid)})
            if a:
                assessment_map[aid] = {
                    "title": a.get("title", "Unknown"),
                    "assessment_type": a.get("assessment_type", "unknown"),
                    "total_marks": a.get("total_marks", 0),
                }
        except Exception:
            pass

    results = []

    # MCQ submissions
    for s in mcq_subs:
        aid = s["assessment_id"]
        info = assessment_map.get(aid, {})
        results.append({
            "assessmentId": aid,
            "assessmentTitle": info.get("title", "Unknown Assessment"),
            "assessmentType": info.get("assessment_type", "mcq"),
            "submissionType": "mcq",
            "status": "evaluated",
            "score": s.get("score"),
            "total_marks": s.get("total_marks") or info.get("total_marks"),
            "submitted_at": s.get("submitted_at"),
        })

    # Coding submissions — group by assessment_id (take first/latest)
    coding_by_assessment = {}
    for s in coding_subs:
        aid = s["assessment_id"]
        if aid not in coding_by_assessment:
            coding_by_assessment[aid] = s

    for aid, s in coding_by_assessment.items():
        info = assessment_map.get(aid, {})
        results.append({
            "assessmentId": aid,
            "assessmentTitle": info.get("title", "Unknown Assessment"),
            "assessmentType": info.get("assessment_type", "coding"),
            "submissionType": "coding",
            "status": s.get("status", "submitted"),
            "score": s.get("final_score") or s.get("ai_score") or s.get("score"),
            "total_marks": s.get("max_marks") or info.get("total_marks"),
            "submitted_at": s.get("submitted_at"),
        })

    # Manual submissions
    for s in manual_subs:
        aid = s["assessment_id"]
        info = assessment_map.get(aid, {})
        manual_eval = s.get("manual_evaluation", {})
        manual_status = s.get("status", "evaluated")
        results.append({
            "assessmentId": aid,
            "assessmentTitle": info.get("title", "Unknown Assessment"),
            "assessmentType": info.get("assessment_type", "manual"),
            "submissionType": "manual",
            "status": manual_status,
            "score": s.get("teacher_adjusted_score") if manual_status == "finalized" else None,
            "total_marks": manual_eval.get("total_marks") or info.get("total_marks"),
            "submitted_at": s.get("submitted_at"),
        })

    # Sort by submitted_at descending
    results.sort(key=lambda x: x.get("submitted_at") or "", reverse=True)

    return {"submissions": results}


@router.get("/student/manual-submission-detail/{assessment_id}")
async def get_student_manual_submission_detail(
    assessment_id: str,
    current_user: dict = Depends(student_required)
):
    """Get detailed manual submission results for a student (after teacher review)."""
    from app.database import get_database
    from bson import ObjectId
    db = get_database()

    student_id = str(current_user["_id"])

    sub = await db.manual_submissions.find_one({
        "assessment_id": assessment_id,
        "student_id": student_id
    })
    if not sub:
        raise HTTPException(status_code=404, detail="No manual submission found")

    manual_eval = sub.get("manual_evaluation", {})
    manual_status = sub.get("status", "evaluated")

    # Build per-question results (strip model answers — student shouldn't see them)
    question_results = []
    for r in manual_eval.get("results", []):
        question_results.append({
            "question_id": r.get("question_id"),
            "question_text": r.get("question_text", ""),
            "student_answer": sub.get("student_answers", {}).get(r.get("question_id", ""), ""),
            "final_score": r.get("final_score", 0),
            "max_marks": r.get("max_marks", 0),
            "feedback": r.get("feedback", ""),
            "correctness": r.get("correctness"),
            "completeness": r.get("completeness"),
            "keywords_matched": r.get("keywords_matched", []),
            "keywords_missed": r.get("keywords_missed", []),
        })

    # Use teacher adjusted score if reviewed
    final_score = manual_eval.get("total_score", 0)
    if manual_status == "finalized" and sub.get("teacher_adjusted_score") is not None:
        final_score = sub.get("teacher_adjusted_score")

    return {
        "status": manual_status,
        "total_score": manual_eval.get("total_score", 0),
        "total_marks": manual_eval.get("total_marks", 0),
        "percentage": manual_eval.get("percentage", 0),
        "final_score": final_score,
        "teacher_adjusted_score": sub.get("teacher_adjusted_score"),
        "teacher_feedback": sub.get("teacher_feedback", ""),
        "question_results": question_results,
        "submitted_at": sub.get("submitted_at"),
        "evaluated_at": sub.get("evaluated_at"),
        "reviewed_at": sub.get("reviewed_at"),
    }


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


@router.get("/teacher/mcq-submission/{submission_id}")
async def get_mcq_submission_detail(
    submission_id: str,
    current_user: dict = Depends(teacher_or_admin_required)
):
    """Get full MCQ submission details for teacher (read-only view)."""
    from app.database import get_database
    from app.services.assessment_service import get_assessment_by_id
    from bson import ObjectId
    db = get_database()

    try:
        sub = await db.mcq_submissions.find_one({"_id": ObjectId(submission_id)})
    except Exception as e:
        print(f"MCQ submission lookup error: {e}")
        raise HTTPException(status_code=400, detail="Invalid submission ID")

    if not sub:
        raise HTTPException(status_code=404, detail="MCQ submission not found")

    # Get student info
    student = None
    try:
        student = await db.users.find_one({"_id": ObjectId(sub["student_id"])})
    except Exception:
        pass

    # Get assessment for question details
    assessment = await get_assessment_by_id(sub["assessment_id"])
    mcq_questions = []
    if assessment:
        for q in assessment.get("mcq_questions", []):
            mcq_questions.append({
                "question_id": q.get("question_id"),
                "question_text": q.get("question_text", ""),
                "options": q.get("options", []),
                "correct_option_id": q.get("correct_option_id"),
                "marks": q.get("marks", 1),
                "difficulty": q.get("difficulty", "medium"),
            })

    return {
        "id": str(sub["_id"]),
        "assessment_id": sub["assessment_id"],
        "assessment_title": assessment.get("title", "Unknown") if assessment else "Unknown",
        "student_id": sub["student_id"],
        "student_name": student.get("name", "Unknown") if student else "Unknown",
        "student_email": student.get("email", "") if student else "",
        "score": sub.get("score"),
        "total_marks": sub.get("total_marks"),
        "percentage": sub.get("percentage"),
        "results": sub.get("results", []),
        "mcq_questions": mcq_questions,
        "submitted_at": sub.get("submitted_at"),
    }


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

    # Get Manual (handwritten) submissions
    manual_subs = await db.manual_submissions.find(
        {"assessment_id": assessment_id}
    ).sort("submitted_at", -1).to_list(length=500)

    for sub in manual_subs:
        student = None
        try:
            student = await db.users.find_one({"_id": ObjectId(sub["student_id"])})
        except Exception:
            pass

        evaluation = sub.get("manual_evaluation", {})
        manual_status = sub.get("status", "evaluated")
        # Use teacher adjusted score if finalized
        if manual_status == "finalized" and sub.get("teacher_adjusted_score") is not None:
            display_score = sub.get("teacher_adjusted_score")
        else:
            display_score = evaluation.get("total_score")

        submissions.append({
            "id": str(sub["_id"]),
            "type": "manual",
            "student_id": sub["student_id"],
            "student_name": student.get("name", "Unknown") if student else "Unknown",
            "student_email": student.get("email", "") if student else "",
            "assessment_id": sub["assessment_id"],
            "status": manual_status,
            "score": display_score,
            "total_marks": evaluation.get("total_marks"),
            "percentage": round(display_score / evaluation.get("total_marks", 1) * 100, 1) if display_score is not None and evaluation.get("total_marks") else evaluation.get("percentage"),
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
        manual_count = await db.manual_submissions.count_documents({"assessment_id": aid})

        pending_count = await db.coding_submissions.count_documents(
            {"assessment_id": aid, "status": "pending"}
        )
        # Manual submissions awaiting teacher review
        manual_pending = await db.manual_submissions.count_documents(
            {"assessment_id": aid, "status": {"$nin": ["finalized"]}}
        )
        manual_reviewed = await db.manual_submissions.count_documents(
            {"assessment_id": aid, "status": "finalized"}
        )
        reviewed_count = await db.coding_submissions.count_documents(
            {"assessment_id": aid, "status": {"$in": ["reviewed", "finalized"]}}
        )

        stats[aid] = {
            "submissions_count": mcq_count + coding_count + manual_count,
            "pending_count": pending_count + manual_pending,
            "reviewed_count": reviewed_count + mcq_count + manual_reviewed,  # MCQ auto-evaluated
        }

    return stats


@router.get("/teacher/manual-submission/{submission_id}")
async def get_manual_submission_detail(
    submission_id: str,
    current_user: dict = Depends(teacher_or_admin_required)
):
    """Get detailed manual submission for teacher review."""
    from app.database import get_database
    from bson import ObjectId
    db = get_database()

    sub = await db.manual_submissions.find_one({"_id": ObjectId(submission_id)})
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    student = None
    try:
        student = await db.users.find_one({"_id": ObjectId(sub["student_id"])})
    except Exception:
        pass

    evaluation = sub.get("manual_evaluation", {})
    return {
        "id": str(sub["_id"]),
        "student_id": sub["student_id"],
        "student_name": student.get("name", "Unknown") if student else "Unknown",
        "student_email": student.get("email", "") if student else "",
        "assessment_id": sub["assessment_id"],
        "student_answers": sub.get("student_answers", {}),
        "status": sub.get("status", "evaluated"),
        "total_score": evaluation.get("total_score", 0),
        "total_marks": evaluation.get("total_marks", 0),
        "percentage": evaluation.get("percentage", 0),
        "results": evaluation.get("results", []),
        "submitted_at": sub.get("submitted_at"),
        "evaluated_at": sub.get("evaluated_at"),
        "teacher_adjusted_score": sub.get("teacher_adjusted_score"),
        "teacher_feedback": sub.get("teacher_feedback"),
        "reviewed_by": sub.get("reviewed_by"),
        "reviewed_at": sub.get("reviewed_at"),
    }


@router.put("/teacher/manual-submission/{submission_id}/review")
async def review_manual_submission(
    submission_id: str,
    review: dict,
    current_user: dict = Depends(teacher_or_admin_required)
):
    """Teacher adjusts score and adds feedback to a manual submission."""
    from app.database import get_database
    from bson import ObjectId
    db = get_database()

    sub = await db.manual_submissions.find_one({"_id": ObjectId(submission_id)})
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    update_data = {
        "status": "finalized",
        "teacher_adjusted_score": review.get("teacher_adjusted_score"),
        "teacher_feedback": review.get("teacher_feedback", ""),
        "reviewed_by": str(current_user["_id"]),
        "reviewed_at": datetime.utcnow(),
    }

    await db.manual_submissions.update_one(
        {"_id": ObjectId(submission_id)},
        {"$set": update_data}
    )

    return {"message": "Review submitted successfully", "status": "finalized"}
