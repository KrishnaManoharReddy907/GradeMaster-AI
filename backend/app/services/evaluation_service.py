import os
import httpx
import base64
from datetime import datetime
from typing import Optional, List
from bson import ObjectId

from app.services.judge0_service import execute_code
from app.database import get_database
from app.services.assessment_service import get_assessment_by_id
from app.services.agents.agent_pipeline import run_agent_pipeline
from app.services.agents.ast_analysis_agent import analyze_code_ast
from app.services.agents.bug_detection_agent import detect_bugs
from app.services.agents.llm_code_fix_agent import generate_code_fix


JUDGE0_API_URL = "https://judge0-ce.judge0.com"
JUDGE0_API_KEY = ""

LANGUAGE_IDS = {
    "python": 71,
    "cpp": 54,
    "java": 62,
    "javascript": 63,
    "c": 50
}


async def get_submission_by_id(submission_id: str) -> Optional[dict]:
    db = get_database()
    try:
        submission = await db.coding_submissions.find_one({"_id": ObjectId(submission_id)})
        return submission
    except Exception:
        return None


# ❗ OLD SELF-HOST / BASE64 JUDGE0 EXECUTOR (COMMENTED — NOT USED NOW)

"""
async def execute_code_judge0(
    source_code: str,
    language: str,
    stdin: str,
    expected_output: str,
    time_limit: float = 2.0,
    memory_limit: int = 128000
) -> dict:
    ...
"""
# ---------------------------------------------------------------


async def evaluate_submission(submission_id: str, evaluator_id: str) -> dict:

    db = get_database()

    submission = await get_submission_by_id(submission_id)
    if not submission:
        return {"error": "Submission not found"}

    if submission.get("status") == "evaluated":
        return {"error": "Submission already evaluated"}

    assessment = await get_assessment_by_id(submission["assessment_id"])
    if not assessment:
        return {"error": "Assessment not found"}

    coding_questions = assessment.get("coding_questions", [])

    question = None
    for q in coding_questions:
        if q.get("question_id") == submission["question_id"]:
            question = q
            break

    if not question:
        return {"error": "Question not found in assessment"}

    test_cases = question.get("test_cases", [])

    # Extract problem description with multiple fallbacks
    problem_description = (
        question.get("description") or
        question.get("question_text") or
        question.get("title") or
        question.get("problem_statement") or
        ""
    )

    # Final fallback if still empty
    if not problem_description.strip():
        problem_description = "Solve the given coding problem based on test cases."

    # DEBUG: Log question keys and description
    print(f"[Evaluation] Question keys: {list(question.keys())}")
    print(f"[Evaluation] Problem description extracted: {problem_description[:100]}...")

    if not test_cases:
        return {"error": "No test cases found"}

    source_code = submission["code"]
    language = submission["language"]

    test_results = []
    passed_tests = 0
    total_tests = len(test_cases)

    for i, test_case in enumerate(test_cases):

        stdin = test_case.get("input", "")
        expected_output = test_case.get("expected_output", "")
        is_hidden = test_case.get("is_hidden", False)

        # ⭐ NEW PUBLIC JUDGE0 EXECUTION
        result = await execute_code(
            source_code,
            language,
            stdin
        )

        stdout = result.get("stdout") or ""

        passed = False
        if stdout.strip() == expected_output.strip():
            passed = True
            passed_tests += 1

        test_result = {
            "test_case_index": i,
            "passed": passed,
            "status_description": result.get("status", {}).get("description", "Error"),
            "time": result.get("time"),
            "memory": result.get("memory"),
            "is_hidden": is_hidden
        }

        if not is_hidden:
            test_result["input"] = stdin
            test_result["expected_output"] = expected_output
            test_result["actual_output"] = stdout

        if result.get("stderr"):
            test_result["stderr"] = result.get("stderr")

        if result.get("compile_output"):
            test_result["compile_output"] = result.get("compile_output")

        test_results.append(test_result)

    max_marks = question.get("marks", 0)

    score = round((passed_tests / total_tests) * max_marks, 2) if total_tests > 0 else 0

    # Run AST analysis on source code (safe - won't crash on errors)
    try:
        ast_analysis = analyze_code_ast(source_code)
    except Exception as e:
        print(f"[Evaluation] AST analysis failed: {e}")
        ast_analysis = {
            "loops": 0,
            "conditions": 0,
            "functions": 0,
            "returns": 0,
            "nesting_depth": 0,
            "complexity": "unknown",
            "details": {"parse_error": True, "error_message": str(e)}
        }

    # Check if all tests passed - skip bug detection and code fix
    if passed_tests == total_tests:
        # All tests passed - clean output, no bugs, no fixes
        bugs = []
        code_fix = {}
        suggested_fix = {}
        ai_feedback = "All test cases passed successfully. Excellent work!"
        feedback = "All test cases passed!"
        print(f"[Evaluation] All {total_tests} tests passed - skipping bug detection and code fix agents")
    else:
        # Some tests failed - run bug detection and code fix agents
        bugs = detect_bugs(
            test_results=test_results,
            ast_analysis=ast_analysis,
            stderr=None,
            compile_output=None
        )

        # DEBUG: Log problem description before calling code fix
        print(f"[Evaluation] DEBUG PROBLEM DESCRIPTION: {problem_description}")

        # Run Code Fix Agent
        code_fix = await generate_code_fix(
            code=source_code,
            bugs=bugs,
            language=language,
            test_cases=test_results,
            problem_description=problem_description
        )
        
        # Set feedback based on results
        if passed_tests == 0:
            feedback = "No test cases passed. Please check your solution."
        else:
            feedback = f"Partially correct. {passed_tests}/{total_tests} test cases passed."
        
        # These will be set by agent_results below
        suggested_fix = None
        ai_feedback = None

    # Run agent pipeline for comprehensive analysis (always runs for AST + analysis)
    agent_results = await run_agent_pipeline(
        db=db,
        submission=submission,
        score=score,
        passed_tests=passed_tests,
        total_tests=total_tests,
        test_results=test_results,
        assessment_title=assessment.get("title", ""),
        question_description=problem_description,
        ast_analysis=ast_analysis
    )

    # Use agent results only if not all tests passed
    if passed_tests < total_tests:
        suggested_fix = agent_results.get("suggested_fix", {})
        ai_feedback = agent_results.get("ai_feedback", "Review your solution.")

    # Determine result status and confidence score
    if passed_tests == total_tests:
        result_status = "correct"
        confidence_score = 95
    elif passed_tests > 0:
        result_status = "partial"
        confidence_score = 70
    else:
        result_status = "wrong"
        confidence_score = 40

    # Build structured response
    result_summary = {
        "ai_score": score,
        "max_marks": max_marks,
        "passed": passed_tests,
        "total": total_tests,
        "status": result_status,
        "confidence_score": confidence_score,
        "feedback": feedback
    }

    analysis = {
        "ast": ast_analysis,
        "code_quality": agent_results.get("analysis", {}),
        "plagiarism": {
            "score": agent_results.get("plagiarism_score", 0),
            "similar_submission_id": agent_results.get("similar_submission_id")
        }
    }

    issues = {
        "bugs": bugs,
        "test_results": test_results
    }

    ai_insights = {
        "feedback": ai_feedback,
        "suggested_fix": suggested_fix,
        "code_fix": code_fix
    }

    await db.coding_submissions.update_one(
        {"_id": ObjectId(submission_id)},
        {"$set": {
            "status": "evaluated",
            "ai_score": score,
            "max_marks": max_marks,
            "passed_tests": passed_tests,
            "total_tests": total_tests,
            "evaluated_by": evaluator_id,
            "evaluated_at": datetime.utcnow(),
            "code_embedding": agent_results.get("code_embedding"),
            # Structured output
            "result_summary": result_summary,
            "analysis": analysis,
            "issues": issues,
            "ai_insights": ai_insights
        }}
    )

    return {
        "submission_id": submission_id,
        "result_summary": result_summary,
        "analysis": analysis,
        "issues": issues,
        "ai_insights": ai_insights
    }


async def batch_evaluate_assessment(assessment_id: str, evaluator_id: str) -> dict:

    db = get_database()

    submissions = await db.coding_submissions.find({
        "assessment_id": assessment_id,
        "status": "pending"
    }).to_list(length=1000)

    if not submissions:
        return {"message": "No pending submissions found", "evaluated": 0}

    evaluated = 0
    failed = 0
    results = []

    for submission in submissions:

        result = await evaluate_submission(str(submission["_id"]), evaluator_id)

        if "error" in result:
            failed += 1
            results.append({
                "submission_id": str(submission["_id"]),
                "error": result["error"]
            })
        else:
            evaluated += 1
            results.append({
                "submission_id": str(submission["_id"]),
                "score": result["score"],
                "passed_tests": result["passed_tests"],
                "total_tests": result["total_tests"]
            })

    return {
        "assessment_id": assessment_id,
        "total_submissions": len(submissions),
        "evaluated": evaluated,
        "failed": failed,
        "results": results
    }


async def get_submission_result(submission_id: str) -> Optional[dict]:

    submission = await get_submission_by_id(submission_id)
    if not submission:
        return None

    # Get raw data with fallbacks
    result_summary = submission.get("result_summary", {})
    ai_insights = submission.get("ai_insights", {})

    # Build unified evaluation block
    evaluation = {
        "ai_score": submission.get("ai_score") or result_summary.get("ai_score"),
        "final_score": submission.get("final_score"),
        "max_marks": submission.get("max_marks") or result_summary.get("max_marks"),
        "passed_tests": submission.get("passed_tests") or result_summary.get("passed"),
        "total_tests": submission.get("total_tests") or result_summary.get("total"),
        "confidence_score": result_summary.get("confidence_score", 0),
        "status": submission.get("status", "pending"),
        "result_status": result_summary.get("status", "unknown")
    }

    # Build unified feedback block
    feedback = {
        "ai_feedback": ai_insights.get("feedback") or submission.get("ai_feedback") or result_summary.get("feedback") or "",
        "teacher_feedback": submission.get("teacher_feedback") or ""
    }

    # Build unified corrections block
    corrections = {
        "code_fix": ai_insights.get("code_fix") or submission.get("code_fix") or {},
        "suggested_fix": ai_insights.get("suggested_fix") or submission.get("suggested_fix") or {}
    }

    # Build analysis block with fallbacks
    analysis = submission.get("analysis") or {
        "ast": submission.get("ast_analysis"),
        "code_quality": {},
        "plagiarism": {
            "score": submission.get("plagiarism_score", 0),
            "similar_submission_id": submission.get("similar_submission_id")
        }
    }

    # Build issues block with fallbacks
    issues = submission.get("issues") or {
        "bugs": submission.get("bugs", []),
        "test_results": submission.get("test_results", [])
    }

    # Build review info block
    review = {
        "reviewed_by": submission.get("reviewed_by"),
        "reviewed_at": submission.get("reviewed_at"),
        "finalized_by": submission.get("finalized_by"),
        "finalized_at": submission.get("finalized_at"),
        "review_history": submission.get("review_history", [])
    }

    return {
        "submission_id": str(submission["_id"]),
        "assessment_id": submission.get("assessment_id"),
        "question_id": submission.get("question_id"),
        "student_id": submission.get("student_id"),
        "code": submission.get("code"),
        "language": submission.get("language"),
        # Unified structured response
        "evaluation": evaluation,
        "feedback": feedback,
        "corrections": corrections,
        "analysis": analysis,
        "issues": issues,
        "review": review,
        # Timestamps
        "submitted_at": submission.get("submitted_at"),
        "evaluated_at": submission.get("evaluated_at")
    }