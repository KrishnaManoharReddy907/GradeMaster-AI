"""Job handlers. Each receives the job document and returns a small result dict."""

from bson import ObjectId

from app.database import get_database
from app.jobs.worker import register


class PermanentJobError(Exception):
    permanent = True


@register("evaluate_coding")
async def evaluate_coding_job(job: dict) -> dict:
    from app.core.errors import AppError
    from app.services.evaluation_service import evaluate_submission

    try:
        result = await evaluate_submission(job["ref_id"], job.get("created_by") or "system")
    except AppError as exc:  # business-rule failure (already finalized, no tests…): don't retry
        raise PermanentJobError(exc.detail)
    summary = result.get("result_summary", {})
    return {"submission_id": job["ref_id"], "ai_score": summary.get("ai_score"),
            "passed": summary.get("passed"), "total": summary.get("total")}


@register("mcq_explanations")
async def mcq_explanations_job(job: dict) -> dict:
    from app.services.submission_service import generate_mcq_explanations

    db = get_database()
    sub = await db.mcq_submissions.find_one({"_id": ObjectId(job["ref_id"])})
    if not sub:
        raise PermanentJobError("submission no longer exists")
    assessment = await db.assessments.find_one({"_id": ObjectId(sub["assessment_id"])})
    if not assessment:
        raise PermanentJobError("assessment no longer exists")
    results = await generate_mcq_explanations(sub.get("results", []), assessment.get("mcq_questions", []))
    filled = sum(1 for r in results if r.get("ai_explanation"))
    await db.mcq_submissions.update_one({"_id": sub["_id"]},
                                        {"$set": {"results": results, "explanations_status": "done"}})
    return {"explanations": filled}
