"""Teacher review and finalization of coding and handwritten submissions.

Teachers have the final say: they can override AI scores and leave feedback; every
change is appended to ``review_history``; ``finalized`` is terminal and immutable.
"""

from datetime import datetime, timezone
from typing import List, Optional

from pymongo import ReturnDocument

from app.core.errors import BadRequest, Conflict
from app.database import get_database


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _current_score(sub: dict) -> Optional[float]:
    """Teacher score if set (0 is a valid score!), else the AI score."""
    if sub.get("final_score") is not None:
        return sub["final_score"]
    return sub.get("ai_score")


# ─── Coding ───────────────────────────────────────────────────────────────

async def review_coding(sub: dict, teacher_id: str, final_score: float, feedback: Optional[str]) -> dict:
    if sub.get("status") == "finalized":
        raise Conflict("This submission is finalized and cannot be changed")
    if sub.get("status") not in ("evaluated", "reviewed", "failed", "pending"):
        raise BadRequest("Wait for the automatic evaluation to finish before reviewing")
    max_marks = float(sub.get("max_marks") or 0)
    if final_score > max_marks:
        raise BadRequest(f"Score cannot exceed the maximum of {max_marks:g}")

    entry = {"teacher_id": teacher_id, "old_score": _current_score(sub), "new_score": final_score,
             "comment": feedback, "timestamp": _now()}
    updated = await get_database().coding_submissions.find_one_and_update(
        {"_id": sub["_id"], "status": {"$ne": "finalized"}},
        {"$set": {"final_score": final_score, "teacher_feedback": feedback, "reviewed_by": teacher_id,
                  "reviewed_at": _now(), "status": "reviewed"},
         "$push": {"review_history": entry}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise Conflict("This submission was finalized in the meantime")
    return updated


async def finalize_coding(sub: dict, teacher_id: str) -> dict:
    if sub.get("status") == "finalized":
        raise Conflict("This submission is already finalized")
    if sub.get("status") not in ("evaluated", "reviewed"):
        raise BadRequest("Only evaluated or reviewed submissions can be finalized")
    score = _current_score(sub)
    if score is None:
        raise BadRequest("Cannot finalize without a score")
    updated = await get_database().coding_submissions.find_one_and_update(
        {"_id": sub["_id"], "status": {"$in": ["evaluated", "reviewed"]}},
        {"$set": {"status": "finalized", "final_score": score, "finalized_by": teacher_id, "finalized_at": _now()},
         "$push": {"review_history": {"teacher_id": teacher_id, "old_score": score, "new_score": score,
                                      "comment": "Finalized", "timestamp": _now()}}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise Conflict("The submission changed while finalizing; reload and try again")
    return updated


async def finalize_assessment_coding(assessment_id: str, teacher_id: str) -> dict:
    """Finalize every evaluated/reviewed coding submission of an assessment in one go."""
    db = get_database()
    subs = await db.coding_submissions.find(
        {"assessment_id": assessment_id, "status": {"$in": ["evaluated", "reviewed"]}}).to_list(5000)
    done = 0
    for s in subs:
        try:
            await finalize_coding(s, teacher_id)
            done += 1
        except (BadRequest, Conflict):
            continue
    return {"finalized": done, "skipped": len(subs) - done}


# ─── Handwritten / manual ─────────────────────────────────────────────────

async def review_manual(sub: dict, teacher_id: str, question_scores: List, overall: Optional[float],
                        feedback: Optional[str], finalize: bool) -> dict:
    if sub.get("status") == "finalized":
        raise Conflict("This submission is finalized and cannot be changed")
    evaluation = sub.get("manual_evaluation") or {}
    results = [dict(r) for r in evaluation.get("results", [])]
    total_marks = float(evaluation.get("total_marks") or sum(float(r.get("max_marks", 0)) for r in results))
    by_id = {r.get("question_id"): r for r in results}

    for adj in question_scores:
        r = by_id.get(adj.question_id)
        if r is None:
            raise BadRequest(f"Unknown question {adj.question_id}")
        if adj.score > float(r.get("max_marks", 0)):
            raise BadRequest(f"{adj.question_id}: score cannot exceed {float(r.get('max_marks', 0)):g}")
        r["teacher_score"] = adj.score
        if adj.comment is not None:
            r["teacher_comment"] = adj.comment

    if question_scores:
        final = round(sum(float(r.get("teacher_score", r.get("final_score", 0))) for r in results), 2)
    elif overall is not None:
        final = overall
    else:
        final = float(sub.get("final_score") if sub.get("final_score") is not None else evaluation.get("total_score", 0))
    if final > total_marks + 1e-9:
        raise BadRequest(f"Score cannot exceed the maximum of {total_marks:g}")

    previous = sub.get("final_score", sub.get("teacher_adjusted_score", evaluation.get("total_score")))
    update = {
        "manual_evaluation.results": results,
        "teacher_adjusted_score": final,
        "final_score": final,
        "final_percentage": round(final / total_marks * 100, 2) if total_marks else 0,
        "teacher_feedback": feedback or "",
        "reviewed_by": teacher_id,
        "reviewed_at": _now(),
        "status": "finalized" if finalize else "reviewed",
    }
    if finalize:
        update.update(finalized_by=teacher_id, finalized_at=_now())
    updated = await get_database().manual_submissions.find_one_and_update(
        {"_id": sub["_id"], "status": {"$ne": "finalized"}},
        {"$set": update, "$push": {"review_history": {
            "teacher_id": teacher_id, "old_score": previous, "new_score": final,
            "comment": feedback, "timestamp": _now(), "finalized": finalize}}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise Conflict("This submission was finalized in the meantime")
    return updated
