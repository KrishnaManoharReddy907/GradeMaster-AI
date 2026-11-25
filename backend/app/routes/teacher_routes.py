"""Teacher review workflow: coding review/finalize, jobs, plagiarism view, review queue."""

from bson import ObjectId
from fastapi import APIRouter, Depends, Query

from app.core.deps import is_admin, load_owned_assessment, load_owned_submission, require_staff, to_object_id
from app.core.errors import Forbidden, NotFound
from app.database import get_database
from app.evaluation import plagiarism
from app.jobs.worker import get_job, serialize_job
from app.schemas.submission_schema import TeacherReviewCreate
from app.services.audit_service import record_audit
from app.services.evaluation_service import serialize_coding_detail
from app.services.review_service import finalize_assessment_coding, finalize_coding, review_coding

router = APIRouter()


async def _student(user_id: str) -> dict:
    if not ObjectId.is_valid(user_id):
        return {}
    return await get_database().users.find_one({"_id": ObjectId(user_id)}, {"name": 1, "email": 1}) or {}


@router.get("/submission/{submission_id}")
async def get_coding_submission(submission_id: str, teacher: dict = Depends(require_staff)):
    sub, assessment = await load_owned_submission("coding_submissions", submission_id, teacher)
    detail = serialize_coding_detail(sub, await _student(sub["student_id"]))
    question = next((q for q in assessment.get("coding_questions", []) if q["question_id"] == sub["question_id"]), {})
    detail["question"] = {k: question.get(k) for k in ("title", "problem_statement", "marks", "topic")}
    detail["assessment_title"] = assessment.get("title")
    from app.services import proctoring_service as proctor
    detail["proctoring"] = (await proctor.summaries_for(assessment, [sub["student_id"]])).get(sub["student_id"])
    if detail["proctoring"] and detail["proctoring"]["violations"]:
        detail["review_flags"] = list(detail.get("review_flags") or []) + ["left_exam"]
    return detail


@router.post("/review/{submission_id}")
async def review_submission_route(submission_id: str, data: TeacherReviewCreate, teacher: dict = Depends(require_staff)):
    sub, _ = await load_owned_submission("coding_submissions", submission_id, teacher)
    updated = await review_coding(sub, str(teacher["_id"]), data.final_score, data.teacher_feedback)
    await record_audit(teacher, "coding.review", "coding_submission", submission_id,
                       {"old": sub.get("final_score", sub.get("ai_score")), "new": data.final_score})
    return serialize_coding_detail(updated, await _student(updated["student_id"]))


@router.post("/finalize/{submission_id}")
async def finalize_submission_route(submission_id: str, teacher: dict = Depends(require_staff)):
    sub, _ = await load_owned_submission("coding_submissions", submission_id, teacher)
    updated = await finalize_coding(sub, str(teacher["_id"]))
    await record_audit(teacher, "coding.finalize", "coding_submission", submission_id,
                       {"final_score": updated.get("final_score")})
    return serialize_coding_detail(updated, await _student(updated["student_id"]))


@router.post("/assessments/{assessment_id}/finalize-coding")
async def finalize_all_coding_route(assessment_id: str, teacher: dict = Depends(require_staff)):
    await load_owned_assessment(assessment_id, teacher)
    result = await finalize_assessment_coding(assessment_id, str(teacher["_id"]))
    await record_audit(teacher, "coding.finalize_batch", "assessment", assessment_id, result)
    return result


@router.get("/review-history/{submission_id}")
async def get_review_history_route(submission_id: str, teacher: dict = Depends(require_staff)):
    sub, _ = await load_owned_submission("coding_submissions", submission_id, teacher)
    return {"submission_id": submission_id, "ai_score": sub.get("ai_score"), "final_score": sub.get("final_score"),
            "status": sub.get("status"), "review_history": sub.get("review_history", [])}


@router.get("/jobs/{job_id}")
async def get_job_route(job_id: str, teacher: dict = Depends(require_staff)):
    job = await get_job(job_id)
    if not job:
        raise NotFound("Job not found")
    if not is_admin(teacher) and job.get("created_by") not in (str(teacher["_id"]), "auto"):
        raise Forbidden("You do not have access to this job")
    return serialize_job(job)


@router.get("/assessments/{assessment_id}/plagiarism")
async def plagiarism_report(assessment_id: str, question_id: str = Query(None, max_length=40),
                            teacher: dict = Depends(require_staff)):
    """Pairwise similarity for one coding question (or all of them)."""
    assessment = await load_owned_assessment(assessment_id, teacher)
    db = get_database()
    query = {"assessment_id": assessment_id}
    if question_id:
        query["question_id"] = question_id
    subs = await db.coding_submissions.find(query, {"code": 1, "language": 1, "student_id": 1, "question_id": 1}).to_list(2000)
    users = {str(u["_id"]): u.get("name", "Unknown") for u in await db.users.find(
        {"_id": {"$in": [ObjectId(s["student_id"]) for s in subs if ObjectId.is_valid(s["student_id"])]}},
        {"name": 1}).to_list(None)}
    by_q: dict = {}
    for s in subs:
        by_q.setdefault(s["question_id"], []).append(s)
    titles = {q["question_id"]: q.get("title") for q in assessment.get("coding_questions", [])}
    questions = []
    for qid, items in by_q.items():
        pairs = plagiarism.pairwise_matrix([(str(s["_id"]), s.get("code", ""), s.get("language")) for s in items])
        lookup = {str(s["_id"]): s for s in items}
        questions.append({"question_id": qid, "title": titles.get(qid), "submissions": len(items), "pairs": [
            p | {"student_a": users.get(lookup[p["a"]]["student_id"]), "student_b": users.get(lookup[p["b"]]["student_id"])}
            for p in pairs]})
    return {"assessment_id": assessment_id, "thresholds": {"flag": plagiarism.FLAG_THRESHOLD, "warn": plagiarism.WARN_THRESHOLD},
            "questions": questions}


@router.get("/plagiarism/compare")
async def plagiarism_compare(a: str, b: str, teacher: dict = Depends(require_staff)):
    """Side-by-side code with the matching line ranges highlighted."""
    sub_a, assessment = await load_owned_submission("coding_submissions", a, teacher)
    sub_b = await get_database().coding_submissions.find_one({"_id": to_object_id(b, "submission")})
    if not sub_b or sub_b["assessment_id"] != sub_a["assessment_id"]:
        raise NotFound("Submission not found in this assessment")
    fa = plagiarism.fingerprint(sub_a.get("code", ""), sub_a.get("language", "python"))
    fb = plagiarism.fingerprint(sub_b.get("code", ""), sub_b.get("language", "python"))
    lines_a, lines_b = plagiarism.matched_lines(fa, fb)
    score = plagiarism.similarity(fa, fb)
    student_a, student_b = await _student(sub_a["student_id"]), await _student(sub_b["student_id"])
    return {"score": score, "level": plagiarism.classify(score),
            "a": {"id": a, "student": student_a.get("name"), "language": sub_a.get("language"),
                  "code": sub_a.get("code", ""), "matched_lines": lines_a},
            "b": {"id": b, "student": student_b.get("name"), "language": sub_b.get("language"),
                  "code": sub_b.get("code", ""), "matched_lines": lines_b}}


FLAG_WEIGHT = {"possible_prompt_injection": 5, "possible_plagiarism": 4, "ai_unavailable": 4, "low_ocr_confidence": 3,
               "score_disagreement": 3, "execution_incomplete": 3, "ai_feedback_unavailable": 1, "low_ai_confidence": 2}


@router.get("/review-queue")
async def review_queue(teacher: dict = Depends(require_staff)):
    """Everything awaiting the teacher, riskiest first (flags explain why)."""
    db = get_database()
    query = {} if is_admin(teacher) else {"teacher_id": str(teacher["_id"])}
    assessments = {str(a["_id"]): a for a in await db.assessments.find(query, {"title": 1}).to_list(5000)}
    ids = list(assessments)
    coding = await db.coding_submissions.find(
        {"assessment_id": {"$in": ids}, "status": {"$in": ["evaluated", "reviewed", "failed"]}},
        {"code": 0, "issues": 0}).to_list(5000)
    manual = await db.manual_submissions.find(
        {"assessment_id": {"$in": ids}, "status": {"$ne": "finalized"}}, {"student_answers": 0}).to_list(5000)
    users = {str(u["_id"]): u.get("name") for u in await db.users.find(
        {"_id": {"$in": [ObjectId(s["student_id"]) for s in coding + manual if ObjectId.is_valid(s["student_id"])]}},
        {"name": 1}).to_list(None)}
    items = []
    for s in coding:
        flags = s.get("review_flags", []) + (["evaluation_failed"] if s["status"] == "failed" else [])
        items.append({"id": str(s["_id"]), "type": "coding", "assessment_id": s["assessment_id"],
                      "assessment_title": assessments.get(s["assessment_id"], {}).get("title"),
                      "student_name": users.get(s["student_id"]), "status": s["status"], "flags": flags,
                      "ai_score": s.get("ai_score"), "max_marks": s.get("max_marks"), "submitted_at": s.get("submitted_at"),
                      "risk": sum(FLAG_WEIGHT.get(f, 2) for f in flags)})
    for s in manual:
        flags = s.get("review_flags", [])
        ev = s.get("manual_evaluation") or {}
        items.append({"id": str(s["_id"]), "type": "manual", "assessment_id": s["assessment_id"],
                      "assessment_title": assessments.get(s["assessment_id"], {}).get("title"),
                      "student_name": users.get(s["student_id"]), "status": s.get("status"), "flags": flags,
                      "ai_score": ev.get("total_score"), "max_marks": ev.get("total_marks"),
                      "submitted_at": s.get("submitted_at"), "risk": sum(FLAG_WEIGHT.get(f, 2) for f in flags)})
    items.sort(key=lambda i: (-i["risk"], str(i.get("submitted_at") or "")))
    return {"total": len(items), "flagged": sum(1 for i in items if i["flags"]), "items": items}
