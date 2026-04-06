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
        # All tests passed - no bugs, no fixes needed
        bugs = []
        code_fix = {
            "fix_explanation": "Code is correct. No fixes needed.",
            "suggested_change": "No changes required.",
            "corrected_code": None
        }
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

    # Run agent pipeline for comprehensive analysis
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

    # Basic feedback (kept for backward compatibility)
    if passed_tests == total_tests:
        feedback = "All test cases passed!"
        # Override ai_feedback for perfect submissions
        agent_results["ai_feedback"] = "All test cases passed successfully. Excellent work!"
        agent_results["suggested_fix"] = "No fixes needed. Your solution is correct."
    elif passed_tests == 0:
        feedback = "No test cases passed. Please check your solution."
    else:
        feedback = f"Partially correct. {passed_tests}/{total_tests} test cases passed."

    await db.coding_submissions.update_one(
        {"_id": ObjectId(submission_id)},
        {"$set": {
            "status": "evaluated",
            "score": score,
            "max_marks": max_marks,
            "passed_tests": passed_tests,
            "total_tests": total_tests,
            "test_results": test_results,
            "feedback": feedback,
            "evaluated_by": evaluator_id,
            "evaluated_at": datetime.utcnow(),
            # AST analysis results
            "ast_analysis": ast_analysis,
            # Bug Detection Agent results
            "bugs": bugs,
            # Code Fix Agent results
            "code_fix": code_fix,
            # Agent pipeline results
            "analysis": agent_results["analysis"],
            "plagiarism_score": agent_results["plagiarism_score"],
            "similar_submission_id": agent_results.get("similar_submission_id"),
            "code_embedding": agent_results.get("code_embedding"),
            "suggested_fix": agent_results["suggested_fix"],
            "ai_feedback": agent_results["ai_feedback"]
        }}
    )

    return {
        "submission_id": submission_id,
        "status": "evaluated",
        "score": score,
        "max_marks": max_marks,
        "passed_tests": passed_tests,
        "total_tests": total_tests,
        "feedback": feedback,
        "test_results": test_results,
        # AST analysis results
        "ast_analysis": ast_analysis,
        # Bug Detection Agent results
        "bugs": bugs,
        # Code Fix Agent results
        "code_fix": code_fix,
        # Include agent results in response
        "analysis": agent_results["analysis"],
        "plagiarism_score": agent_results["plagiarism_score"],
        "similar_submission_id": agent_results.get("similar_submission_id"),
        "suggested_fix": agent_results["suggested_fix"],
        "ai_feedback": agent_results["ai_feedback"]
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

    return {
        "submission_id": str(submission["_id"]),
        "assessment_id": submission["assessment_id"],
        "question_id": submission["question_id"],
        "student_id": submission["student_id"],
        "language": submission["language"],
        "status": submission.get("status", "pending"),
        "score": submission.get("score"),
        "max_marks": submission.get("max_marks"),
        "passed_tests": submission.get("passed_tests"),
        "total_tests": submission.get("total_tests"),
        "feedback": submission.get("feedback"),
        "test_results": submission.get("test_results", []),
        "submitted_at": submission.get("submitted_at"),
        "evaluated_at": submission.get("evaluated_at"),
        # AST analysis results
        "ast_analysis": submission.get("ast_analysis"),
        # Agent pipeline results
        "analysis": submission.get("analysis"),
        "plagiarism_score": submission.get("plagiarism_score"),
        "similar_submission_id": submission.get("similar_submission_id"),
        "bugs": submission.get("bugs"),
        "code_fix": submission.get("code_fix"),
        "suggested_fix": submission.get("suggested_fix"),
        "ai_feedback": submission.get("ai_feedback")
    }