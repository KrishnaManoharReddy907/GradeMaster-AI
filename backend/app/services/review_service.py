"""
Teacher Review Service

Handles teacher review and score modification for coding submissions.
Maintains review history for audit trail.
"""

from datetime import datetime
from typing import Optional
from bson import ObjectId

from app.database import get_database


async def get_submission_by_id(submission_id: str) -> Optional[dict]:
    """Fetch submission by ID."""
    db = get_database()
    try:
        submission = await db.coding_submissions.find_one({"_id": ObjectId(submission_id)})
        return submission
    except Exception:
        return None


async def review_submission(
    submission_id: str,
    teacher_id: str,
    final_score: float,
    teacher_feedback: Optional[str] = None
) -> dict:
    """
    Review and update a coding submission with teacher's score and feedback.

    Args:
        submission_id: ID of the submission to review
        teacher_id: ID of the reviewing teacher
        final_score: Teacher-assigned final score
        teacher_feedback: Optional teacher feedback/comments

    Returns:
        Updated submission data or error dict
    """
    db = get_database()

    # Fetch submission
    submission = await get_submission_by_id(submission_id)
    if not submission:
        return {"error": "Submission not found"}

    # Check if already finalized
    if submission.get("status") == "finalized":
        return {"error": "Submission is finalized and cannot be modified"}

    # Get old score for history
    old_score = submission.get("ai_score") or submission.get("final_score") or 0

    # Validate final_score against max_marks
    max_marks = submission.get("max_marks", 100)
    if final_score < 0:
        return {"error": "Score cannot be negative"}
    if final_score > max_marks:
        return {"error": f"Score cannot exceed max marks ({max_marks})"}

    # Build review history entry
    review_entry = {
        "teacher_id": teacher_id,
        "old_score": old_score,
        "new_score": final_score,
        "comment": teacher_feedback,
        "timestamp": datetime.utcnow()
    }

    # Update submission
    update_result = await db.coding_submissions.update_one(
        {"_id": ObjectId(submission_id)},
        {
            "$set": {
                "final_score": final_score,
                "teacher_feedback": teacher_feedback,
                "reviewed_by": teacher_id,
                "reviewed_at": datetime.utcnow(),
                "status": "reviewed"
            },
            "$push": {
                "review_history": review_entry
            }
        }
    )

    if update_result.modified_count == 0:
        return {"error": "Failed to update submission"}

    # Fetch and return updated submission
    updated_submission = await get_submission_by_id(submission_id)

    return {
        "submission_id": submission_id,
        "status": "reviewed",
        "ai_score": updated_submission.get("ai_score"),
        "final_score": final_score,
        "teacher_feedback": teacher_feedback,
        "reviewed_by": teacher_id,
        "reviewed_at": updated_submission.get("reviewed_at"),
        "review_history": updated_submission.get("review_history", [])
    }


async def finalize_submission(
    submission_id: str,
    teacher_id: str
) -> dict:
    """
    Finalize a submission, locking it from further modifications.

    Args:
        submission_id: ID of the submission to finalize
        teacher_id: ID of the teacher finalizing

    Returns:
        Result dict with status
    """
    db = get_database()

    # 1. Check submission exists
    submission = await get_submission_by_id(submission_id)
    if not submission:
        return {"error": "Submission not found"}

    # 2. Check if already finalized
    if submission.get("status") == "finalized":
        return {"error": "Submission is already finalized"}

    # 3. Check if reviewed (must be reviewed before finalizing)
    current_status = submission.get("status")
    if current_status not in ["reviewed", "evaluated"]:
        return {"error": f"Cannot finalize submission with status '{current_status}'. Must be reviewed first."}

    # Get final score (prefer teacher's score, fallback to AI score)
    final_score = submission.get("final_score") or submission.get("ai_score")
    if final_score is None:
        return {"error": "Cannot finalize without a score"}

    # 4. Set status = "finalized" (no further edits allowed after this)
    await db.coding_submissions.update_one(
        {"_id": ObjectId(submission_id)},
        {
            "$set": {
                "status": "finalized",
                "final_score": final_score,
                "finalized_by": teacher_id,
                "finalized_at": datetime.utcnow()
            }
        }
    )

    return {
        "submission_id": submission_id,
        "status": "finalized",
        "final_score": final_score,
        "finalized_by": teacher_id
    }


async def get_review_history(submission_id: str) -> dict:
    """
    Get review history for a submission.

    Args:
        submission_id: ID of the submission

    Returns:
        Review history list or error
    """
    submission = await get_submission_by_id(submission_id)
    if not submission:
        return {"error": "Submission not found"}

    return {
        "submission_id": submission_id,
        "ai_score": submission.get("ai_score"),
        "final_score": submission.get("final_score"),
        "status": submission.get("status"),
        "review_history": submission.get("review_history", [])
    }
