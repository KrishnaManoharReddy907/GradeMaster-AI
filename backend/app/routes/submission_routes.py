from typing import Dict, List

from bson import ObjectId
from fastapi import APIRouter, Depends, status

from app.core.deps import (
    load_owned_assessment,
    load_owned_submission,
    require_staff,
    require_student,
)
from app.core.errors import NotFound
from app.database import get_database
from app.schemas.submission_schema import (
    CodingSubmissionCreate,
    CodingSubmissionResponse,
    ManualTeacherReviewCreate,
    MCQSubmissionCreate,
    MCQSubmissionResponse,
)
from app.services.assessment_service import get_assessment_by_id
from app.services.audit_service import record_audit
from app.services.evaluation_service import queue_assessment_evaluation
from app.services.review_service import review_manual
from app.services.submission_service import (
    get_student_submission_list,
    get_student_submission_status,
    submit_coding,
    submit_mcq,
)

router = APIRouter()


async def _users_by_id(ids) -> Dict[str, dict]:
    oids = [ObjectId(i) for i in set(ids) if ObjectId.is_valid(i)]
    if not oids:
        return {}
    rows = await get_database().users.find({"_id": {"$in": oids}}, {"name": 1, "email": 1, "section_id": 1}).to_list(None)
    return {str(u["_id"]): u for u in rows}


# ─── Student ──────────────────────────────────────────────────────────────

@router.post("/student/submit-mcq", response_model=MCQSubmissionResponse, status_code=status.HTTP_201_CREATED)
async def submit_mcq_route(data: MCQSubmissionCreate, student: dict = Depends(require_student)):
    sub = await submit_mcq(student, data)
    visible = sub["results_visible"]
    return MCQSubmissionResponse(
        id=str(sub["_id"]), assessment_id=sub["assessment_id"], student_id=sub["student_id"],
        score=sub["score"] if visible else 0, total_marks=sub["total_marks"],
        percentage=sub["percentage"] if visible else 0, results_visible=visible, submitted_at=sub["submitted_at"])


@router.post("/student/submit-coding", response_model=CodingSubmissionResponse, status_code=status.HTTP_201_CREATED)
async def submit_coding_route(data: CodingSubmissionCreate, student: dict = Depends(require_student)):
    sub = await submit_coding(student, data)
    return CodingSubmissionResponse(
        id=str(sub["_id"]), assessment_id=sub["assessment_id"], question_id=sub["question_id"],
        student_id=sub["student_id"], language=sub["language"], status=sub["status"],
        job_id=sub.get("job_id"), submitted_at=sub["submitted_at"])


@router.get("/student/submission-status/{assessment_id}")
async def get_submission_status_route(assessment_id: str, student: dict = Depends(require_student)):
    return await get_student_submission_status(str(student["_id"]), assessment_id)


@router.get("/student/all-submissions")
async def get_all_student_submissions_route(student: dict = Depends(require_student)):
    return {"submissions": await get_student_submission_list(str(student["_id"]))}


@router.get("/student/manual-submission-detail/{assessment_id}")
async def get_student_manual_submission_detail(assessment_id: str, student: dict = Depends(require_student)):
    sub = await get_database().manual_submissions.find_one(
        {"assessment_id": assessment_id, "student_id": str(student["_id"])})
    if not sub:
        raise NotFound("No handwritten submission found")
    evaluation = sub.get("manual_evaluation") or {}
    final = sub.get("status") == "finalized"
    assessment = await get_assessment_by_id(assessment_id)
    qtext = {q.get("question_id"): q.get("question_text", "") for q in (assessment or {}).get("manual_questions", [])}
    return {
        "status": sub.get("status", "evaluated"),
        "submitted_at": sub.get("submitted_at"),
        "reviewed_at": sub.get("reviewed_at") if final else None,
        "total_marks": evaluation.get("total_marks", 0),
        "final_score": sub.get("final_score", sub.get("teacher_adjusted_score")) if final else None,
        "percentage": sub.get("final_percentage") if final else None,
        "teacher_feedback": sub.get("teacher_feedback", "") if final else "",
        "question_results": [{
            "question_id": r.get("question_id"),
            "question_text": qtext.get(r.get("question_id"), ""),
            "student_answer": (sub.get("student_answers") or {}).get(r.get("question_id", ""), ""),
            "score": r.get("teacher_score", r.get("final_score")) if final else None,
            "max_marks": r.get("max_marks", 0),
            "feedback": r.get("feedback", "") if final else "",
            "teacher_comment": r.get("teacher_comment") if final else None,
            "criteria": [{"criterion": c.get("criterion"), "awarded": c.get("awarded"), "marks": c.get("marks"),
                          "comment": c.get("comment")} for c in r.get("criteria", [])] if final else [],
            "keywords_matched": r.get("keywords_matched", []) if final else [],
            "keywords_missed": r.get("keywords_missed", []) if final else [],
        } for r in evaluation.get("results", [])],
    }


# ─── Teacher ──────────────────────────────────────────────────────────────

@router.post("/teacher/evaluate/{submission_id}")
async def evaluate_submission_route(submission_id: str, teacher: dict = Depends(require_staff)):
    from app.jobs.worker import enqueue, serialize_job

    sub, _ = await load_owned_submission("coding_submissions", submission_id, teacher)
    job = await enqueue("evaluate_coding", str(sub["_id"]), created_by=str(teacher["_id"]))
    return {"message": "Evaluation queued", "job": serialize_job(job)}


@router.post("/teacher/evaluate-assessment/{assessment_id}")
async def batch_evaluate_assessment_route(assessment_id: str, teacher: dict = Depends(require_staff)):
    await load_owned_assessment(assessment_id, teacher)
    result = await queue_assessment_evaluation(assessment_id, str(teacher["_id"]))
    await record_audit(teacher, "coding.evaluate_batch", "assessment", assessment_id, {"queued": result["queued"]})
    return result


@router.get("/teacher/submissions/assessment/{assessment_id}")
async def get_assessment_submissions_route(assessment_id: str, teacher: dict = Depends(require_staff)):
    await load_owned_assessment(assessment_id, teacher)
    db = get_database()
    mcq = await db.mcq_submissions.find({"assessment_id": assessment_id}).sort("submitted_at", -1).to_list(5000)
    coding = await db.coding_submissions.find({"assessment_id": assessment_id},
                                              {"code": 0, "issues": 0, "code_embedding": 0}).sort("submitted_at", -1).to_list(5000)
    manual = await db.manual_submissions.find({"assessment_id": assessment_id}).sort("submitted_at", -1).to_list(5000)
    users = await _users_by_id(s["student_id"] for s in mcq + coding + manual)

    def base(s, kind):
        u = users.get(s["student_id"], {})
        return {"id": str(s["_id"]), "type": kind, "student_id": s["student_id"],
                "student_name": u.get("name", "Unknown"), "student_email": u.get("email", ""),
                "assessment_id": assessment_id, "submitted_at": s.get("submitted_at"),
                "review_flags": s.get("review_flags", [])}

    rows: List[dict] = []
    for s in mcq:
        rows.append(base(s, "mcq") | {"status": "evaluated", "score": s.get("score"),
                                      "total_marks": s.get("total_marks"), "percentage": s.get("percentage")})
    for s in coding:
        rows.append(base(s, "coding") | {
            "question_id": s.get("question_id"), "language": s.get("language"), "status": s.get("status", "pending"),
            "ai_score": s.get("ai_score"), "final_score": s.get("final_score"), "max_marks": s.get("max_marks"),
            "score": s.get("final_score") if s.get("final_score") is not None else s.get("ai_score"),
            "plagiarism": ((s.get("analysis") or {}).get("plagiarism") or {}).get("score"),
            "error": s.get("evaluation_error")})
    for s in manual:
        ev = s.get("manual_evaluation") or {}
        score = s.get("final_score", s.get("teacher_adjusted_score")) if s.get("status") == "finalized" else ev.get("total_score")
        total = ev.get("total_marks") or 0
        rows.append(base(s, "manual") | {"status": s.get("status", "evaluated"), "score": score,
                                         "ai_score": ev.get("total_score"), "total_marks": total,
                                         "percentage": round(score / total * 100, 1) if score is not None and total else None,
                                         "ocr_confidence": (s.get("ocr") or {}).get("avg_confidence")})
    return {"submissions": rows, "total": len(rows)}


@router.get("/teacher/assessment-stats")
async def get_assessment_stats_route(teacher: dict = Depends(require_staff)):
    db = get_database()
    query = {} if teacher.get("role") == "admin" else {"teacher_id": str(teacher["_id"])}
    ids = [str(a["_id"]) for a in await db.assessments.find(query, {"_id": 1}).to_list(5000)]
    stats = {aid: {"submissions_count": 0, "pending_count": 0, "reviewed_count": 0, "flagged_count": 0} for aid in ids}

    async def tally(collection: str, done_statuses: set | None):
        """done_statuses=None means every submission is already graded (MCQ)."""
        pipeline = [{"$match": {"assessment_id": {"$in": ids}}},
                    {"$group": {"_id": {"a": "$assessment_id", "s": "$status"}, "n": {"$sum": 1},
                                "flagged": {"$sum": {"$cond": [{"$gt": [{"$size": {"$ifNull": ["$review_flags", []]}}, 0]}, 1, 0]}}}}]
        async for row in db[collection].aggregate(pipeline):
            st = stats.get(row["_id"]["a"])
            if st is None:
                continue
            st["submissions_count"] += row["n"]
            st["flagged_count"] += row["flagged"]
            if done_statuses is None or row["_id"].get("s") in done_statuses:
                st["reviewed_count"] += row["n"]
            else:
                st["pending_count"] += row["n"]

    await tally("mcq_submissions", None)
    await tally("coding_submissions", {"reviewed", "finalized"})
    await tally("manual_submissions", {"finalized"})
    return stats


@router.get("/teacher/mcq-submission/{submission_id}")
async def get_mcq_submission_detail(submission_id: str, teacher: dict = Depends(require_staff)):
    sub, assessment = await load_owned_submission("mcq_submissions", submission_id, teacher)
    student = (await _users_by_id([sub["student_id"]])).get(sub["student_id"], {})
    return {
        "id": str(sub["_id"]), "assessment_id": sub["assessment_id"], "assessment_title": assessment.get("title"),
        "student_id": sub["student_id"], "student_name": student.get("name", "Unknown"),
        "student_email": student.get("email", ""), "score": sub.get("score"), "total_marks": sub.get("total_marks"),
        "percentage": sub.get("percentage"), "results": sub.get("results", []),
        "mcq_questions": [{"question_id": q.get("question_id"), "question_text": q.get("question_text", ""),
                           "options": q.get("options", []), "correct_option_id": q.get("correct_option_id"),
                           "marks": q.get("marks", 1), "difficulty": q.get("difficulty", "medium"),
                           "topic": q.get("topic")} for q in assessment.get("mcq_questions", [])],
        "submitted_at": sub.get("submitted_at"),
    }


def _manual_detail(sub: dict, assessment: dict, student: dict) -> dict:
    ev = sub.get("manual_evaluation") or {}
    questions = {q.get("question_id"): q for q in assessment.get("manual_questions", [])}
    return {
        "id": str(sub["_id"]), "student_id": sub["student_id"], "student_name": student.get("name", "Unknown"),
        "student_email": student.get("email", ""), "assessment_id": sub["assessment_id"],
        "assessment_title": assessment.get("title"), "student_answers": sub.get("student_answers", {}),
        "status": sub.get("status", "evaluated"), "total_score": ev.get("total_score", 0),
        "total_marks": ev.get("total_marks", 0), "percentage": ev.get("percentage", 0),
        "results": [r | {"question_text": questions.get(r.get("question_id"), {}).get("question_text", ""),
                         "model_answer": questions.get(r.get("question_id"), {}).get("model_answer", "")}
                    for r in ev.get("results", [])],
        "review_flags": sub.get("review_flags", []),
        "ocr": sub.get("ocr"), "uploads": sub.get("uploads", []),
        "submitted_at": sub.get("submitted_at"), "evaluated_at": sub.get("evaluated_at"),
        "final_score": sub.get("final_score", sub.get("teacher_adjusted_score")),
        "teacher_adjusted_score": sub.get("teacher_adjusted_score"),
        "teacher_feedback": sub.get("teacher_feedback"), "reviewed_by": sub.get("reviewed_by"),
        "reviewed_at": sub.get("reviewed_at"), "review_history": sub.get("review_history", []),
    }


@router.get("/teacher/manual-submission/{submission_id}")
async def get_manual_submission_detail(submission_id: str, teacher: dict = Depends(require_staff)):
    sub, assessment = await load_owned_submission("manual_submissions", submission_id, teacher)
    student = (await _users_by_id([sub["student_id"]])).get(sub["student_id"], {})
    return _manual_detail(sub, assessment, student)


@router.put("/teacher/manual-submission/{submission_id}/review")
async def review_manual_submission(submission_id: str, review: ManualTeacherReviewCreate,
                                   teacher: dict = Depends(require_staff)):
    sub, assessment = await load_owned_submission("manual_submissions", submission_id, teacher)
    updated = await review_manual(sub, str(teacher["_id"]), review.question_scores, review.teacher_adjusted_score,
                                  review.teacher_feedback, review.finalize)
    await record_audit(teacher, "manual.finalize" if review.finalize else "manual.review", "manual_submission",
                       submission_id, {"final_score": updated.get("final_score")})
    student = (await _users_by_id([updated["student_id"]])).get(updated["student_id"], {})
    return {"message": "Review saved", "status": updated["status"], "submission": _manual_detail(updated, assessment, student)}
