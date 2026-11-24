"""Coding evaluation: sandboxed execution, analysis, plagiarism and AI feedback."""

import logging
import re
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ReturnDocument

from app.ai.code_feedback import generate_code_feedback
from app.core.config import settings
from app.core.errors import BadRequest, Conflict, NotFound, ServiceUnavailable
from app.database import get_database
from app.evaluation import plagiarism
from app.services.agents.bug_detection_agent import detect_bugs
from app.services.judge0_service import execute_batch, outputs_match

logger = logging.getLogger("grademaster.evaluation")

EVALUABLE_STATUSES = ["pending", "failed", "evaluated"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def analyze_structure(code: str, language: str) -> dict:
    """Language-aware structural metrics (tree-sitter AST for Python, heuristics otherwise)."""
    if language == "python":
        try:
            from app.services.agents.ast_analysis_agent import analyze_code_ast
            result = analyze_code_ast(code)
            result["method"] = "ast"
            return result
        except Exception as exc:  # noqa: BLE001
            logger.info("AST analysis unavailable: %s", type(exc).__name__)
    lines = [l for l in code.splitlines() if l.strip()]
    loops = len(re.findall(r"\b(for|while)\b", code))
    conditions = len(re.findall(r"\b(if|else if|switch|case)\b", code))
    functions = len(re.findall(r"\b(def|function)\b|\w+\s+\w+\s*\([^;{]*\)\s*\{", code))
    depth = max_depth = 0
    for ch in code:
        if ch == "{":
            depth += 1
            max_depth = max(max_depth, depth)
        elif ch == "}":
            depth = max(0, depth - 1)
    complexity = "high" if loops >= 3 or max_depth > 5 else "medium" if loops >= 1 else "low"
    return {"loops": loops, "conditions": conditions, "functions": functions, "returns": len(re.findall(r"\breturn\b", code)),
            "nesting_depth": max_depth, "complexity": complexity, "lines": len(lines), "method": "heuristic"}


async def _plagiarism_check(db, submission: dict) -> dict:
    others = await db.coding_submissions.find(
        {"assessment_id": submission["assessment_id"], "question_id": submission["question_id"],
         "_id": {"$ne": submission["_id"]}},
        {"code": 1, "language": 1, "analysis.plagiarism": 1},
    ).to_list(2000)
    score, match_id = plagiarism.best_match(
        submission["code"], submission["language"],
        [(str(o["_id"]), o.get("code", ""), o.get("language")) for o in others])
    result = {"score": round(score * 100), "similar_submission_id": match_id,
              "level": plagiarism.classify(score), "method": "winnowing"}

    if settings.enable_codebert:
        try:
            from app.services.agents.semantic_plagiarism_agent import detect_semantic_plagiarism
            semantic = await detect_semantic_plagiarism(db, submission)
            result["semantic_score"] = semantic.get("plagiarism_score", 0)
        except Exception:  # noqa: BLE001
            logger.info("CodeBERT check skipped")

    # Symmetric: let the partner know about the match too, if stronger than what it has.
    if match_id and score >= plagiarism.WARN_THRESHOLD:
        partner = next((o for o in others if str(o["_id"]) == match_id), None)
        partner_score = ((partner or {}).get("analysis") or {}).get("plagiarism", {}).get("score", 0)
        if partner is not None and result["score"] > (partner_score or 0):
            await db.coding_submissions.update_one(
                {"_id": partner["_id"]},
                {"$set": {"analysis.plagiarism": {**result, "similar_submission_id": str(submission["_id"])}},
                 "$addToSet": {"review_flags": "possible_plagiarism"}})
    return result


async def evaluate_submission(submission_id: str, evaluator_id: str) -> dict:
    db = get_database()
    try:
        oid = ObjectId(submission_id)
    except (InvalidId, TypeError):
        raise NotFound("Submission not found")

    existing = await db.coding_submissions.find_one({"_id": oid}, {"status": 1})
    if not existing:
        raise NotFound("Submission not found")
    if existing["status"] in ("reviewed", "finalized"):
        raise Conflict("This submission has been reviewed by a teacher and cannot be re-evaluated")

    submission = await db.coding_submissions.find_one_and_update(
        {"_id": oid, "status": {"$in": EVALUABLE_STATUSES}},
        {"$set": {"status": "evaluating", "evaluation_started_at": _now()}},
        return_document=ReturnDocument.AFTER,
    )
    if not submission:
        raise Conflict("This submission is already being evaluated")

    try:
        return await _evaluate(db, submission, evaluator_id)
    except Exception as exc:
        await db.coding_submissions.update_one(
            {"_id": oid, "status": "evaluating"},
            {"$set": {"status": "failed", "evaluation_error": getattr(exc, "detail", str(exc))[:300]}})
        raise


async def _evaluate(db, submission: dict, evaluator_id: str) -> dict:
    assessment = await db.assessments.find_one({"_id": ObjectId(submission["assessment_id"])})
    if not assessment:
        raise NotFound("Assessment not found")
    question = next((q for q in assessment.get("coding_questions", [])
                     if q.get("question_id") == submission["question_id"]), None)
    if not question:
        raise NotFound("Question not found in assessment")
    test_cases = question.get("test_cases") or []
    if not test_cases:
        raise BadRequest("This question has no test cases")

    code, language = submission["code"], submission["language"]
    runs = await execute_batch(
        code, language, [t.get("input", "") for t in test_cases],
        cpu_time_limit=float(question.get("time_limit_seconds", 2)),
        memory_limit_mb=int(question.get("memory_limit_mb", 256)),
    )
    if all(r.get("error") for r in runs):
        raise ServiceUnavailable("The code execution service is unavailable. Try again shortly.")

    test_results, passed = [], 0
    for i, (tc, run) in enumerate(zip(test_cases, runs)):
        ok = run.get("status", {}).get("id") in (3, 4) and outputs_match(run.get("stdout"), tc.get("expected_output"))
        passed += ok
        tr = {"test_case_index": i, "passed": ok, "is_hidden": bool(tc.get("is_hidden")),
              "status_description": "Accepted" if ok else (
                  "Wrong Answer" if run.get("status", {}).get("id") in (3, 4) else run.get("status", {}).get("description", "Error")),
              "time": run.get("time"), "memory": run.get("memory")}
        if not tc.get("is_hidden"):
            tr.update(input=tc.get("input", ""), expected_output=tc.get("expected_output", ""),
                      actual_output=run.get("stdout") or "")
        if run.get("stderr"):
            tr["stderr"] = run["stderr"][:2000]
        if run.get("compile_output"):
            tr["compile_output"] = run["compile_output"][:2000]
        test_results.append(tr)

    total = len(test_cases)
    max_marks = float(question.get("marks", 0))
    partial = (assessment.get("coding_config") or {}).get("partial_marking", True)
    ratio = passed / total if total else 0
    score = round(ratio * max_marks, 2) if partial else (max_marks if passed == total else 0.0)

    structure = analyze_structure(code, language)
    bugs = [] if passed == total else detect_bugs(test_results=test_results, ast_analysis=structure)
    plag = await _plagiarism_check(db, submission)

    problem = "\n".join(filter(None, [question.get("title"), question.get("problem_statement"),
                                      question.get("input_format"), question.get("output_format")]))
    ai = await generate_code_feedback(code=code, language=language, problem=problem, passed=passed,
                                      total=total, test_results=test_results, bugs=bugs)

    status_word = "correct" if passed == total else "partial" if passed else "wrong"
    if passed == total:
        accuracy = 100
    else:
        quality = (5 if structure.get("nesting_depth", 10) <= 4 else 2) + (5 if structure.get("complexity") != "high" else 0)
        runtime_errors = sum(1 for t in test_results if t.get("stderr"))
        accuracy = round(min(ratio * 80 + quality + max(0, 10 - runtime_errors * 2), 100))

    flags = []
    if plag["level"] in ("high", "moderate"):
        flags.append("possible_plagiarism")
    if any(r.get("error") for r in runs):
        flags.append("execution_incomplete")
    if ai.get("source") != "ai":
        flags.append("ai_feedback_unavailable")

    result_summary = {"ai_score": score, "max_marks": max_marks, "passed": passed, "total": total,
                      "status": status_word, "accuracy_score": accuracy, "partial_marking": partial,
                      "feedback": "All test cases passed." if passed == total else f"{passed}/{total} test cases passed."}
    analysis = {"ast": structure, "plagiarism": plag,
                "code_quality": {"language": language, "lines": len([l for l in code.splitlines() if l.strip()]),
                                 "notes": ai.get("quality_notes", [])}}
    issues = {"bugs": bugs, "test_results": test_results}
    ai_insights = {"feedback": ai.get("feedback"), "mistake_summary": ai.get("mistake_summary"),
                   "suggested_fix": {"explanation": ai.get("fix_explanation"), "change": ai.get("suggested_change")},
                   "code_fix": {"corrected_code": ai.get("corrected_code"), "fix_explanation": ai.get("fix_explanation"),
                                "suggested_change": ai.get("suggested_change")},
                   "source": ai.get("source")}

    await db.coding_submissions.update_one({"_id": submission["_id"]}, {"$set": {
        "status": "evaluated", "ai_score": score, "max_marks": max_marks, "passed_tests": passed,
        "total_tests": total, "evaluated_by": evaluator_id, "evaluated_at": _now(), "evaluation_error": None,
        "result_summary": result_summary, "analysis": analysis, "issues": issues, "ai_insights": ai_insights,
        "review_flags": flags,
    }})
    return {"submission_id": str(submission["_id"]), "result_summary": result_summary, "analysis": analysis,
            "issues": issues, "ai_insights": ai_insights, "review_flags": flags}


async def queue_assessment_evaluation(assessment_id: str, evaluator_id: str) -> dict:
    from app.jobs.worker import enqueue

    db = get_database()
    subs = await db.coding_submissions.find(
        {"assessment_id": assessment_id, "status": {"$in": ["pending", "failed"]}}, {"_id": 1}).to_list(5000)
    jobs = [await enqueue("evaluate_coding", str(s["_id"]), created_by=evaluator_id) for s in subs]
    return {"assessment_id": assessment_id, "queued": len(jobs), "job_ids": [str(j["_id"]) for j in jobs]}


def serialize_coding_detail(s: dict, student: Optional[dict] = None) -> dict:
    summary = s.get("result_summary") or {}
    insights = s.get("ai_insights") or {}
    return {
        "submission_id": str(s["_id"]),
        "assessment_id": s.get("assessment_id"),
        "question_id": s.get("question_id"),
        "student_id": s.get("student_id"),
        "student_name": (student or {}).get("name"),
        "student_email": (student or {}).get("email"),
        "code": s.get("code"),
        "language": s.get("language"),
        "evaluation": {
            "ai_score": s.get("ai_score"),
            "final_score": s.get("final_score"),
            "max_marks": s.get("max_marks"),
            "passed_tests": s.get("passed_tests"),
            "total_tests": s.get("total_tests"),
            "accuracy_score": summary.get("accuracy_score", 0),
            "status": s.get("status", "pending"),
            "result_status": summary.get("status", "unknown"),
            "error": s.get("evaluation_error"),
        },
        "feedback": {"ai_feedback": insights.get("feedback") or summary.get("feedback") or "",
                     "teacher_feedback": s.get("teacher_feedback") or "",
                     "source": insights.get("source")},
        "corrections": {"code_fix": insights.get("code_fix") or {}, "suggested_fix": insights.get("suggested_fix") or {}},
        "analysis": s.get("analysis") or {},
        "issues": s.get("issues") or {"bugs": [], "test_results": []},
        "review_flags": s.get("review_flags", []),
        "review": {"reviewed_by": s.get("reviewed_by"), "reviewed_at": s.get("reviewed_at"),
                   "finalized_by": s.get("finalized_by"), "finalized_at": s.get("finalized_at"),
                   "review_history": s.get("review_history", [])},
        "submitted_at": s.get("submitted_at"),
        "evaluated_at": s.get("evaluated_at"),
    }
