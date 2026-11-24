"""Student submissions (MCQ, coding) and the student-facing status view."""

import logging
from datetime import datetime, timezone
from typing import List, Optional

from pymongo.errors import DuplicateKeyError

from app.ai import llm
from app.core.errors import BadRequest, Conflict
from app.database import get_database
from app.services.assessment_service import (
    check_student_eligible,
    check_submission_window,
    get_assessment_by_id,
    require_assessment,
    results_visible,
)

logger = logging.getLogger("grademaster.submissions")

ALLOWED_CODING_LANGUAGES = ["python", "cpp", "java", "c", "javascript"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def calculate_mcq_score(answers: List, mcq_questions: List[dict]) -> dict:
    """Score every question (unanswered questions score 0)."""
    chosen = {a.question_id: a.selected_option_id for a in answers}
    score, total, results = 0.0, 0.0, []
    for q in mcq_questions:
        marks = float(q.get("marks", 1))
        total += marks
        selected = chosen.get(q["question_id"])
        correct = selected is not None and selected == q.get("correct_option_id")
        score += marks if correct else 0
        results.append({
            "question_id": q["question_id"],
            "selected_option_id": selected,
            "correct_option_id": q.get("correct_option_id"),
            "is_correct": correct,
            "answered": selected is not None,
            "marks_obtained": marks if correct else 0,
            "max_marks": marks,
            "topic": q.get("topic"),
            "ai_explanation": "",
        })
    return {"score": score, "total_marks": total,
            "percentage": round(score / total * 100, 2) if total else 0.0, "results": results}


def validate_mcq_answers(answers: List, mcq_questions: List[dict]) -> None:
    qmap = {q["question_id"]: q for q in mcq_questions}
    seen = set()
    for a in answers:
        if a.question_id in seen:
            raise BadRequest(f"Question {a.question_id} answered more than once")
        seen.add(a.question_id)
        q = qmap.get(a.question_id)
        if not q:
            raise BadRequest(f"Unknown question: {a.question_id}")
        if a.selected_option_id not in {o.get("option_id") for o in q.get("options", [])}:
            raise BadRequest(f"Invalid option for question {a.question_id}")


async def generate_mcq_explanations(results: list, mcq_questions: list) -> list:
    """Fill ``ai_explanation`` for wrong/unanswered questions.

    Teacher-written explanations are used as-is; only the rest go to the model, in a
    single structured call. On AI failure the explanations stay empty.
    """
    qmap = {q["question_id"]: q for q in mcq_questions}
    pending = []
    for r in results:
        if r["is_correct"]:
            continue
        q = qmap.get(r["question_id"], {})
        if q.get("explanation"):
            r["ai_explanation"] = q["explanation"]
            r["explanation_source"] = "teacher"
        else:
            pending.append((r, q))
    if not pending or not llm.is_configured():
        return results

    def opt(q, oid):
        return next((o.get("text", "") for o in q.get("options", []) if o.get("option_id") == oid), "(no answer)")

    items = "\n\n".join(
        f"id: {r['question_id']}\nquestion: {q.get('question_text', '')}\n"
        f"student chose: {opt(q, r['selected_option_id']) if r['selected_option_id'] else '(not answered)'}\n"
        f"correct answer: {opt(q, r['correct_option_id'])}"
        for r, q in pending
    )
    schema = {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
        "id": {"type": "STRING"}, "explanation": {"type": "STRING"}}, "required": ["id", "explanation"]}}
    try:
        data = await llm.generate_json(
            "For each multiple-choice question below, write a 1-2 sentence explanation that says why the "
            "correct answer is right and, if the student answered, why their choice is wrong. Be encouraging "
            "and precise.\n\n" + items,
            schema, system="You are a patient subject tutor.", temperature=0.3, max_tokens=3000,
        )
        by_id = {str(d.get("id")): str(d.get("explanation", "")).strip() for d in data if isinstance(d, dict)}
        for r, _ in pending:
            if by_id.get(r["question_id"]):
                r["ai_explanation"] = by_id[r["question_id"]]
                r["explanation_source"] = "ai"
    except llm.LLMUnavailable as exc:
        logger.info("MCQ explanations skipped: %s", exc)
    return results


async def submit_mcq(student: dict, data) -> dict:
    db = get_database()
    assessment = await require_assessment(data.assessment_id)
    if assessment.get("assessment_type") not in ("mcq", "mixed"):
        raise BadRequest("This assessment does not accept MCQ answers")
    check_student_eligible(student, assessment)
    await check_submission_window(student, assessment)
    questions = assessment.get("mcq_questions") or []
    if not questions:
        raise BadRequest("This assessment has no MCQ questions")
    validate_mcq_answers(data.answers, questions)

    scored = calculate_mcq_score(data.answers, questions)
    doc = {
        "assessment_id": data.assessment_id,
        "student_id": str(student["_id"]),
        "answers": [a.model_dump() for a in data.answers],
        "score": scored["score"],
        "total_marks": scored["total_marks"],
        "percentage": scored["percentage"],
        "results": scored["results"],
        "explanations_status": "pending",
        "submitted_at": _now(),
        "created_at": _now(),
    }
    try:
        doc["_id"] = (await db.mcq_submissions.insert_one(doc)).inserted_id
    except DuplicateKeyError:
        raise Conflict("You have already submitted this assessment")

    from app.jobs.worker import enqueue
    await enqueue("mcq_explanations", str(doc["_id"]))
    doc["results_visible"] = results_visible(assessment)
    return doc


async def submit_coding(student: dict, data) -> dict:
    db = get_database()
    assessment = await require_assessment(data.assessment_id)
    if assessment.get("assessment_type") not in ("coding", "mixed"):
        raise BadRequest("This assessment does not accept code")
    check_student_eligible(student, assessment)
    await check_submission_window(student, assessment)

    question = next((q for q in assessment.get("coding_questions") or [] if q["question_id"] == data.question_id), None)
    if not question:
        raise BadRequest("Question not found in this assessment")
    config = assessment.get("coding_config") or {}
    allowed = config.get("allowed_languages") or ALLOWED_CODING_LANGUAGES
    if data.language not in allowed:
        raise BadRequest(f"{data.language} is not allowed here. Allowed: {', '.join(allowed)}")

    doc = {
        "assessment_id": data.assessment_id,
        "question_id": data.question_id,
        "student_id": str(student["_id"]),
        "code": data.code,
        "language": data.language,
        "status": "pending",
        "max_marks": float(question.get("marks", 0)),
        "topic": question.get("topic"),
        "submitted_at": _now(),
        "created_at": _now(),
    }
    try:
        doc["_id"] = (await db.coding_submissions.insert_one(doc)).inserted_id
    except DuplicateKeyError:
        raise Conflict("You have already submitted code for this question")

    doc["job_id"] = None
    if config.get("enable_auto_grading", True):
        from app.jobs.worker import enqueue
        job = await enqueue("evaluate_coding", str(doc["_id"]), created_by="auto")
        doc["job_id"] = str(job["_id"])
    return doc


def _coding_for_student(s: dict, reveal: bool) -> dict:
    out = {
        "submission_id": str(s["_id"]),
        "question_id": s["question_id"],
        "status": s["status"],
        "language": s.get("language"),
        "code": s.get("code"),
        "max_marks": s.get("max_marks"),
        "submitted_at": s.get("submitted_at"),
        "final_score": s.get("final_score") if s["status"] == "finalized" else None,
        "teacher_feedback": s.get("teacher_feedback") if s["status"] == "finalized" else None,
        "finalized_at": s.get("finalized_at"),
    }
    if reveal and s["status"] in ("evaluated", "reviewed", "finalized"):
        summary = s.get("result_summary") or {}
        tests = [
            {k: v for k, v in t.items() if not t.get("is_hidden") or k in ("test_case_index", "passed", "is_hidden", "status_description")}
            for t in (s.get("issues") or {}).get("test_results", [])
        ]
        out.update({
            "ai_score": s.get("ai_score"),
            "passed_tests": s.get("passed_tests"),
            "total_tests": s.get("total_tests"),
            "result_summary": {k: summary.get(k) for k in ("passed", "total", "status", "accuracy_score", "feedback")},
            "issues": {"bugs": (s.get("issues") or {}).get("bugs", []), "test_results": tests},
            "ai_insights": {"feedback": (s.get("ai_insights") or {}).get("feedback"),
                            "suggested_fix": (s.get("ai_insights") or {}).get("suggested_fix"),
                            "code_fix": (s.get("ai_insights") or {}).get("code_fix")},
            "analysis": {"ast": (s.get("analysis") or {}).get("ast")},
        })
    return out


async def get_student_submission_status(student_id: str, assessment_id: str) -> dict:
    db = get_database()
    assessment = await get_assessment_by_id(assessment_id)
    mcq = await db.mcq_submissions.find_one({"student_id": student_id, "assessment_id": assessment_id})
    coding = await db.coding_submissions.find({"student_id": student_id, "assessment_id": assessment_id}).to_list(100)
    manual = await db.manual_submissions.find_one({"student_id": student_id, "assessment_id": assessment_id})

    visible = bool(assessment) and results_visible(assessment)
    ended = bool(assessment) and assessment["status"] == "ended"

    mcq_questions, mcq_results = [], []
    if mcq and assessment and visible:
        mcq_results = mcq.get("results", [])
        mcq_questions = [{
            "question_id": q.get("question_id"), "question_text": q.get("question_text", ""),
            "options": q.get("options", []), "correct_option_id": q.get("correct_option_id"),
            "marks": q.get("marks", 1), "difficulty": q.get("difficulty", "medium"), "topic": q.get("topic"),
        } for q in assessment.get("mcq_questions", [])]

    manual_final = bool(manual) and manual.get("status") == "finalized"
    return {
        "assessment_id": assessment_id,
        "assessment_status": assessment["status"] if assessment else None,
        "results_visible": visible,
        "mcq_submitted": mcq is not None,
        "mcq_score": mcq.get("score") if mcq and visible else None,
        "mcq_total": mcq.get("total_marks") if mcq else None,
        "mcq_percentage": mcq.get("percentage") if mcq and visible else None,
        "mcq_submitted_at": mcq.get("submitted_at") if mcq else None,
        "mcq_results": mcq_results,
        "mcq_questions": mcq_questions,
        "coding_submitted": bool(coding),
        "coding_submissions": [_coding_for_student(s, reveal=ended or s["status"] == "finalized") for s in coding],
        "manual_submitted": manual is not None,
        "manual_status": manual.get("status", "evaluated") if manual else None,
        "manual_score": (manual.get("final_score", manual.get("teacher_adjusted_score"))) if manual_final else None,
        "manual_adjusted_score": manual.get("teacher_adjusted_score") if manual_final else None,
        "manual_total": (manual.get("manual_evaluation") or {}).get("total_marks") if manual else None,
        "manual_percentage": manual.get("final_percentage") if manual_final else None,
    }


async def get_student_submission_list(student_id: str) -> List[dict]:
    """One row per assessment the student has submitted to, with scores only once released."""
    from app.services.assessment_service import subject_names
    from bson import ObjectId

    db = get_database()
    mcq = await db.mcq_submissions.find({"student_id": student_id}).to_list(1000)
    coding = await db.coding_submissions.find({"student_id": student_id}).to_list(1000)
    manual = await db.manual_submissions.find({"student_id": student_id}).to_list(1000)
    ids = {s["assessment_id"] for s in mcq + coding + manual}
    assessments = {str(a["_id"]): a for a in await db.assessments.find(
        {"_id": {"$in": [ObjectId(i) for i in ids if ObjectId.is_valid(i)]}}).to_list(None)}
    from app.services.assessment_service import calculate_assessment_status
    for a in assessments.values():
        a["status"] = calculate_assessment_status(a["start_time"], a["end_time"])
    names = await subject_names(a["subject_id"] for a in assessments.values())

    rows: dict = {}

    def row(aid: str, kind: str) -> dict:
        a = assessments.get(aid, {})
        return rows.setdefault(aid, {
            "assessment_id": aid, "assessment_title": a.get("title", "Deleted assessment"),
            "assessment_type": a.get("assessment_type", kind), "subject_name": names.get(a.get("subject_id")),
            "total_marks": a.get("total_marks", 0), "score": None, "status": "submitted",
            "submitted_at": None, "parts": [],
        })

    for s in mcq:
        a = assessments.get(s["assessment_id"])
        r = row(s["assessment_id"], "mcq")
        vis = bool(a) and results_visible(a)
        r["parts"].append({"type": "mcq", "status": "graded" if vis else "submitted",
                           "score": s["score"] if vis else None, "max": s["total_marks"]})
        r["submitted_at"] = max(filter(None, [r["submitted_at"], s.get("submitted_at")]))
    for s in coding:
        r = row(s["assessment_id"], "coding")
        fin = s["status"] == "finalized"
        r["parts"].append({"type": "coding", "question_id": s["question_id"],
                           "status": "graded" if fin else ("in_review" if s["status"] != "pending" else "submitted"),
                           "score": s.get("final_score") if fin else None, "max": s.get("max_marks")})
        r["submitted_at"] = max(filter(None, [r["submitted_at"], s.get("submitted_at")]))
    for s in manual:
        r = row(s["assessment_id"], "manual")
        fin = s.get("status") == "finalized"
        r["parts"].append({"type": "manual", "status": "graded" if fin else "in_review",
                           "score": s.get("final_score", s.get("teacher_adjusted_score")) if fin else None,
                           "max": (s.get("manual_evaluation") or {}).get("total_marks")})
        r["submitted_at"] = max(filter(None, [r["submitted_at"], s.get("submitted_at")]))

    for r in rows.values():
        parts = r["parts"]
        if parts and all(p["status"] == "graded" for p in parts):
            r["status"] = "graded"
            r["score"] = round(sum(p["score"] or 0 for p in parts), 2)
            r["max_score"] = round(sum(p["max"] or 0 for p in parts), 2)
        elif any(p["status"] == "in_review" for p in parts):
            r["status"] = "in_review"
    return sorted(rows.values(), key=lambda r: r["submitted_at"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
