"""
Plagiarism Detection Agent

Detects potential plagiarism by comparing code submissions.
Uses code length similarity as a heuristic.
"""

from bson import ObjectId


async def detect_plagiarism(db, submission: dict) -> int:
    """
    Detect potential plagiarism by comparing with recent submissions.

    Compares code length with last 5 submissions of the same assessment.
    Higher similarity in code length may indicate copying.

    Args:
        db: Database instance
        submission: Current submission dictionary

    Returns:
        plagiarism_score: Integer 0-100 indicating plagiarism likelihood
    """

    assessment_id = submission.get("assessment_id")
    question_id = submission.get("question_id")
    student_id = submission.get("student_id")
    current_code = submission.get("code", "")

    # Get current code length (non-empty lines)
    current_lines = [line for line in current_code.split("\n") if line.strip()]
    current_length = len(current_lines)

    if current_length == 0:
        return 0

    # Fetch last 5 submissions for same assessment/question (excluding current student)
    try:
        recent_submissions = await db.coding_submissions.find({
            "assessment_id": assessment_id,
            "question_id": question_id,
            "student_id": {"$ne": student_id}
        }).sort("submitted_at", -1).limit(5).to_list(length=5)
    except Exception:
        return 0

    if not recent_submissions:
        return 0

    # Calculate similarity scores based on code length
    similarity_scores = []

    for other_submission in recent_submissions:
        other_code = other_submission.get("code", "")
        other_lines = [line for line in other_code.split("\n") if line.strip()]
        other_length = len(other_lines)

        if other_length == 0:
            continue

        # Calculate length similarity (0-100)
        length_diff = abs(current_length - other_length)
        max_length = max(current_length, other_length)

        # Similarity: 100 means identical length, 0 means very different
        similarity = max(0, 100 - (length_diff / max_length * 100))
        similarity_scores.append(similarity)

    if not similarity_scores:
        return 0

    # Return highest similarity score as plagiarism indicator
    plagiarism_score = int(max(similarity_scores))

    return plagiarism_score
