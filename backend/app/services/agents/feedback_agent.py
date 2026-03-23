"""
Feedback Generation Agent

Generates comprehensive, context-aware feedback for code submissions using local LLM via Ollama.
Falls back to rule-based feedback if LLM is unavailable.
"""

import os
from typing import List, Dict, Any, Optional

try:
    import ollama
    OLLAMA_AVAILABLE = True
except ImportError:
    OLLAMA_AVAILABLE = False

# Ollama configuration
OLLAMA_MODEL = "llama3"
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")


def format_test_results(test_results: List[Dict[str, Any]]) -> str:
    """
    Format visible test results for LLM prompt.

    Args:
        test_results: List of test result dictionaries

    Returns:
        Formatted string of visible test cases
    """

    visible_tests = []

    for i, result in enumerate(test_results):
        # Skip hidden test cases
        if result.get("is_hidden", False):
            continue

        status = "PASSED" if result.get("passed", False) else "FAILED"
        test_str = f"Test Case {i + 1} [{status}]:\n"
        test_str += f"  Input: {result.get('input', 'N/A')}\n"
        test_str += f"  Expected Output: {result.get('expected_output', 'N/A')}\n"
        test_str += f"  Actual Output: {result.get('actual_output', 'N/A')}"

        if result.get("stderr"):
            test_str += f"\n  Error: {result.get('stderr')}"

        if result.get("compile_output"):
            test_str += f"\n  Compile Output: {result.get('compile_output')}"

        visible_tests.append(test_str)

    if not visible_tests:
        return "No visible test cases available."

    return "\n\n".join(visible_tests)


async def generate_ai_feedback_llm(
    assessment_title: str,
    question_description: str,
    code: str,
    score: float,
    passed_tests: int,
    total_tests: int,
    bugs: List[str],
    plagiarism_score: int,
    test_results: List[Dict[str, Any]]
) -> Optional[str]:
    """
    Generate AI-powered feedback using local Ollama LLM with full context.

    Args:
        assessment_title: Title of the assessment
        question_description: Problem statement/description
        code: Student's submitted code
        score: Achieved score
        passed_tests: Number of passed test cases
        total_tests: Total number of test cases
        bugs: List of detected bugs
        plagiarism_score: Plagiarism likelihood (0-100)
        test_results: Full test execution results

    Returns:
        LLM-generated feedback string or None if failed
    """

    if not OLLAMA_AVAILABLE:
        return None

    # Calculate percentage
    percentage = (passed_tests / total_tests * 100) if total_tests > 0 else 0

    # Format test results for prompt
    formatted_tests = format_test_results(test_results)

    # Build comprehensive prompt
    prompt = f"""You are an expert programming instructor analyzing a student's code submission. Provide specific, actionable feedback.

## Assessment: {assessment_title}

## Problem Statement:
{question_description[:1500] if question_description else "Not provided"}

## Student's Code:
```
{code[:3000]}
```

## Test Execution Results:
{formatted_tests}

## Summary:
- Score: {score} marks
- Test Cases: {passed_tests}/{total_tests} passed ({percentage:.1f}%)
- Detected Issues: {', '.join(bugs) if bugs else 'None'}
- Similarity Score: {plagiarism_score}/100

## Instructions:
Analyze the submission and provide feedback as a structured paragraph covering:

1. **Exact Mistake Analysis**: Look at the FAILED test cases above. Compare the expected output with the actual output. Explain precisely what the code is doing wrong. Reference specific line logic if possible.

2. **Root Cause**: Identify WHY the code produces incorrect output. Is it a logic error, edge case handling, off-by-one error, incorrect condition, wrong data structure usage, etc.?

3. **Corrected Approach**: Suggest the specific fix or corrected logic. Do not write full code, but explain what changes are needed (e.g., "change the loop condition from < to <=", "handle the empty input case", "use a different comparison").

4. **Motivation**: End with a brief encouraging statement appropriate for the score achieved.

Write your response as connected paragraphs (not bullet points or templates). Be specific to THIS code and THESE test results. Do not give generic advice."""

    try:
        # Configure ollama client
        client = ollama.Client(host=OLLAMA_HOST)

        # Call Ollama API
        response = client.chat(
            model=OLLAMA_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are a precise programming instructor. Analyze code against test results and provide specific, actionable feedback. Always reference the actual vs expected output differences."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            options={
                "temperature": 0.5,
                "num_predict": 700
            }
        )

        # Extract response content
        if response and "message" in response:
            return response["message"]["content"]

        return None

    except Exception as e:
        print(f"[FeedbackAgent] Ollama LLM error: {e}")
        return None


def generate_rule_feedback(
    score: float,
    passed_tests: int,
    total_tests: int,
    plagiarism_score: int,
    bugs: List[str],
    test_results: List[Dict[str, Any]] = None
) -> str:
    """
    Generate rule-based feedback (fallback when LLM unavailable).

    Args:
        score: Achieved score
        passed_tests: Number of passed test cases
        total_tests: Total number of test cases
        plagiarism_score: Plagiarism likelihood (0-100)
        bugs: List of detected bugs
        test_results: Optional test results for detailed feedback

    Returns:
        Human-readable feedback string
    """

    feedback_parts = []

    # Score summary
    if total_tests > 0:
        percentage = (passed_tests / total_tests) * 100
        feedback_parts.append(f"Test Results: {passed_tests}/{total_tests} test cases passed ({percentage:.1f}%).")
    else:
        feedback_parts.append("No test cases available for evaluation.")

    # Performance assessment
    if passed_tests == total_tests and total_tests > 0:
        feedback_parts.append("Excellent work! All test cases passed successfully.")
    elif passed_tests == 0 and total_tests > 0:
        feedback_parts.append("Your solution did not pass any test cases. Please review your logic carefully.")

        # Add specific failure details from test results
        if test_results:
            for result in test_results:
                if not result.get("is_hidden") and not result.get("passed"):
                    expected = result.get("expected_output", "").strip()
                    actual = result.get("actual_output", "").strip()
                    if expected and actual:
                        feedback_parts.append(f"For input '{result.get('input', '')}', expected '{expected}' but got '{actual}'.")
                    break  # Show first visible failing case

    elif passed_tests > 0:
        feedback_parts.append("Partial success. Review the failing test cases to identify edge cases or logic errors.")

    # Bug feedback
    if bugs:
        bug_list = ", ".join(bugs)
        feedback_parts.append(f"Issues detected: {bug_list}.")

        # Add specific suggestions based on bug type
        if "Compilation error" in bugs:
            feedback_parts.append("Fix syntax errors before running tests.")
        if "Logic failure" in bugs:
            feedback_parts.append("Check your algorithm logic and boundary conditions.")

    # Plagiarism warning
    if plagiarism_score >= 80:
        feedback_parts.append("Warning: High similarity detected with other submissions. Ensure your work is original.")
    elif plagiarism_score >= 50:
        feedback_parts.append("Note: Moderate similarity detected with other submissions.")

    # Score feedback
    feedback_parts.append(f"Score awarded: {score} marks.")

    # Motivation
    if passed_tests == total_tests and total_tests > 0:
        feedback_parts.append("Keep up the excellent work!")
    elif passed_tests > total_tests // 2:
        feedback_parts.append("You're on the right track. A few more adjustments and you'll get there!")
    else:
        feedback_parts.append("Don't give up. Review the problem requirements and try again.")

    return " ".join(feedback_parts)


async def generate_feedback_async(
    code: str,
    score: float,
    passed_tests: int,
    total_tests: int,
    plagiarism_score: int,
    bugs: List[str],
    assessment_title: str = "",
    question_description: str = "",
    test_results: List[Dict[str, Any]] = None
) -> str:
    """
    Generate feedback using LLM with rule-based fallback.

    Attempts to use Ollama LLM first with full context,
    falls back to rule-based feedback if LLM fails.

    Args:
        code: Student's submitted code
        score: Achieved score
        passed_tests: Number of passed test cases
        total_tests: Total number of test cases
        plagiarism_score: Plagiarism likelihood (0-100)
        bugs: List of detected bugs
        assessment_title: Title of the assessment
        question_description: Problem statement
        test_results: Full test execution results

    Returns:
        Feedback string (LLM-generated or rule-based)
    """

    test_results = test_results or []

    # Try LLM first with full context
    llm_feedback = await generate_ai_feedback_llm(
        assessment_title=assessment_title,
        question_description=question_description,
        code=code,
        score=score,
        passed_tests=passed_tests,
        total_tests=total_tests,
        bugs=bugs,
        plagiarism_score=plagiarism_score,
        test_results=test_results
    )

    if llm_feedback:
        return llm_feedback

    # Fallback to rule-based feedback
    return generate_rule_feedback(
        score=score,
        passed_tests=passed_tests,
        total_tests=total_tests,
        plagiarism_score=plagiarism_score,
        bugs=bugs,
        test_results=test_results
    )


def generate_feedback(
    score: float,
    passed_tests: int,
    total_tests: int,
    plagiarism_score: int,
    bugs: List[str]
) -> str:
    """
    Synchronous wrapper for backward compatibility.

    Note: This returns rule-based feedback only.
    For LLM feedback, use generate_feedback_async() instead.
    """

    return generate_rule_feedback(
        score=score,
        passed_tests=passed_tests,
        total_tests=total_tests,
        plagiarism_score=plagiarism_score,
        bugs=bugs
    )
