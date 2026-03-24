"""
Agent Pipeline Orchestrator

Coordinates all evaluation agents to produce comprehensive analysis.
"""

from typing import List, Dict, Any

from app.services.agents.submission_analysis_agent import analyze_submission
from app.services.agents.semantic_plagiarism_agent import detect_semantic_plagiarism
from app.services.agents.bug_agent import detect_bugs
from app.services.agents.code_fix_agent import suggest_fix
from app.services.agents.feedback_agent import generate_feedback_async


async def run_agent_pipeline(
    db,
    submission: dict,
    score: float,
    passed_tests: int,
    total_tests: int,
    test_results: List[dict],
    assessment_title: str = "",
    question_description: str = ""
) -> Dict[str, Any]:
    """
    Execute the full evaluation agent pipeline.

    Runs all agents in sequence:
    1. Submission Analysis Agent - Analyzes code metadata
    2. Semantic Plagiarism Agent - CodeBERT-based similarity detection
    3. Bug Agent - Detects bugs from test results
    4. Code Fix Agent - Suggests fixes for detected bugs
    5. Feedback Agent - Generates human-readable feedback (LLM-powered)

    Args:
        db: Database instance
        submission: Submission dictionary
        score: Calculated score from test execution
        passed_tests: Number of passed test cases
        total_tests: Total number of test cases
        test_results: List of test execution results
        assessment_title: Title of the assessment
        question_description: Problem statement/description

    Returns:
        Dictionary containing all agent results:
        - analysis: Submission metadata analysis
        - plagiarism_score: Plagiarism likelihood (0-100)
        - similar_submission_id: ID of most similar submission
        - code_embedding: CodeBERT embedding vector
        - bugs: List of detected bugs
        - suggested_fix: Dictionary of fix suggestions
        - ai_feedback: Human-readable feedback string
    """

    # Agent 1: Submission Analysis
    analysis = analyze_submission(submission)

    # Agent 2: Semantic Plagiarism Detection (CodeBERT)
    plagiarism_result = await detect_semantic_plagiarism(db, submission)
    plagiarism_score = plagiarism_result.get("plagiarism_score", 0)
    similar_submission_id = plagiarism_result.get("similar_submission_id")
    code_embedding = plagiarism_result.get("code_embedding")

    # Agent 3: Bug Detection
    bugs = detect_bugs(test_results)

    # Agent 4: Code Fix Suggestions
    suggested_fix = suggest_fix(bugs)

    # Agent 5: Feedback Generation (LLM with full context)
    ai_feedback = await generate_feedback_async(
        code=submission.get("code", ""),
        score=score,
        passed_tests=passed_tests,
        total_tests=total_tests,
        plagiarism_score=plagiarism_score,
        bugs=bugs,
        assessment_title=assessment_title,
        question_description=question_description,
        test_results=test_results
    )

    return {
        "analysis": analysis,
        "plagiarism_score": plagiarism_score,
        "similar_submission_id": similar_submission_id,
        "code_embedding": code_embedding,
        "bugs": bugs,
        "suggested_fix": suggested_fix,
        "ai_feedback": ai_feedback
    }
