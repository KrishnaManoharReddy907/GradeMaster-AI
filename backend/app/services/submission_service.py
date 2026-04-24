from datetime import datetime, timezone
from typing import Optional, List
from bson import ObjectId

from app.database import get_database
from app.services.assessment_service import get_assessment_by_id, make_aware

ALLOWED_CODING_LANGUAGES = ["python", "cpp", "java", "javascript"]


async def check_assessment_active(assessment_id: str) -> dict:
    """Check if assessment exists and is currently active."""
    assessment = await get_assessment_by_id(assessment_id)

    if not assessment:
        return {"error": "Assessment not found"}

    now = datetime.now(timezone.utc)
    start_time = make_aware(assessment["start_time"])
    end_time = make_aware(assessment["end_time"])

    if now < start_time:
        return {"error": "Assessment not active", "code": "forbidden"}

    if now > end_time:
        return {"error": "Assessment not active", "code": "forbidden"}

    return {"valid": True, "assessment": assessment}


async def check_student_eligible(student: dict, assessment: dict) -> dict:
    """Check if student is eligible for this assessment."""
    student_section_id = student.get("section_id")
    student_year = student.get("year")

    if not student_section_id:
        return {"error": "Student section not assigned"}

    if student_section_id not in assessment.get("section_ids", []):
        return {"error": "You are not eligible for this assessment", "code": "forbidden"}

    assessment_year = assessment.get("year")
    if assessment_year and student_year != assessment_year:
        return {"error": "Assessment is not for your year", "code": "forbidden"}

    return {"valid": True}


async def check_mcq_already_submitted(student_id: str, assessment_id: str) -> bool:
    """Check if student already submitted MCQ for this assessment."""
    db = get_database()
    existing = await db.mcq_submissions.find_one({
        "student_id": student_id,
        "assessment_id": assessment_id
    })
    return existing is not None


async def check_coding_already_submitted(student_id: str, assessment_id: str, question_id: str) -> bool:
    """Check if student already submitted coding for this question."""
    db = get_database()
    existing = await db.coding_submissions.find_one({
        "student_id": student_id,
        "assessment_id": assessment_id,
        "question_id": question_id
    })
    return existing is not None


def validate_mcq_answers(answers: List, mcq_questions: List[dict]) -> dict:
    """Validate MCQ answers against questions."""
    question_map = {q["question_id"]: q for q in mcq_questions}

    for answer in answers:
        question_id = answer.question_id
        selected_option_id = answer.selected_option_id

        if question_id not in question_map:
            return {"error": f"Invalid question_id: {question_id}"}

        question = question_map[question_id]
        options = question.get("options", [])
        valid_option_ids = [opt.get("option_id") for opt in options]

        if selected_option_id not in valid_option_ids:
            return {"error": f"Invalid option '{selected_option_id}' for question '{question_id}'"}

    return {"valid": True}


def calculate_mcq_score(answers: List, mcq_questions: List[dict]) -> dict:
    """Calculate MCQ score based on answers and questions."""
    score = 0
    total_marks = 0
    results = []

    question_map = {q["question_id"]: q for q in mcq_questions}

    for question in mcq_questions:
        total_marks += question.get("marks", 1)

    for answer in answers:
        question_id = answer.question_id
        selected_option_id = answer.selected_option_id

        question = question_map.get(question_id)
        if not question:
            continue

        marks = question.get("marks", 1)
        correct_option_id = question.get("correct_option_id")

        is_correct = selected_option_id == correct_option_id
        if is_correct:
            score += marks

        results.append({
            "question_id": question_id,
            "selected_option_id": selected_option_id,
            "correct_option_id": correct_option_id,
            "is_correct": is_correct,
            "marks_obtained": marks if is_correct else 0,
            "max_marks": marks
        })

    return {
        "score": score,
        "total_marks": total_marks,
        "percentage": round((score / total_marks * 100), 2) if total_marks > 0 else 0,
        "results": results
    }


async def submit_mcq(student: dict, data) -> dict:
    """Submit MCQ answers for an assessment."""
    db = get_database()
    student_id = str(student["_id"])

    active_check = await check_assessment_active(data.assessment_id)
    if "error" in active_check:
        return active_check

    assessment = active_check["assessment"]

    assessment_type = assessment.get("assessment_type")
    if assessment_type not in ["mcq", "mixed"]:
        return {"error": "This assessment does not accept MCQ submissions"}

    eligibility = await check_student_eligible(student, assessment)
    if "error" in eligibility:
        return eligibility

    if await check_mcq_already_submitted(student_id, data.assessment_id):
        return {"error": "You have already submitted MCQ for this assessment"}

    mcq_questions = assessment.get("mcq_questions", [])
    if not mcq_questions:
        return {"error": "This assessment has no MCQ questions"}

    answer_validation = validate_mcq_answers(data.answers, mcq_questions)
    if "error" in answer_validation:
        return answer_validation

    score_result = calculate_mcq_score(data.answers, mcq_questions)

    submission_dict = {
        "assessment_id": data.assessment_id,
        "student_id": student_id,
        "answers": [{"question_id": a.question_id, "selected_option_id": a.selected_option_id} for a in data.answers],
        "score": score_result["score"],
        "total_marks": score_result["total_marks"],
        "percentage": score_result["percentage"],
        "results": score_result["results"],
        "submitted_at": datetime.utcnow(),
        "created_at": datetime.utcnow()
    }

    result = await db.mcq_submissions.insert_one(submission_dict)
    submission_dict["_id"] = result.inserted_id

    return submission_dict


async def submit_coding(student: dict, data) -> dict:
    """Submit coding solution for an assessment question."""
    db = get_database()
    student_id = str(student["_id"])

    if data.language not in ALLOWED_CODING_LANGUAGES:
        return {"error": f"Language '{data.language}' is not allowed. Allowed: {ALLOWED_CODING_LANGUAGES}"}

    active_check = await check_assessment_active(data.assessment_id)
    if "error" in active_check:
        return active_check

    assessment = active_check["assessment"]

    assessment_type = assessment.get("assessment_type")
    if assessment_type not in ["coding", "mixed"]:
        return {"error": "This assessment does not accept coding submissions"}

    eligibility = await check_student_eligible(student, assessment)
    if "error" in eligibility:
        return eligibility

    coding_questions = assessment.get("coding_questions", [])
    if not coding_questions:
        return {"error": "This assessment has no coding questions"}

    question = None
    for q in coding_questions:
        if q["question_id"] == data.question_id:
            question = q
            break

    if not question:
        return {"error": "Question not found in this assessment"}

    coding_config = assessment.get("coding_config") or {}
    config_languages = coding_config.get("allowed_languages")

    if config_languages and data.language not in config_languages:
        return {"error": f"Language '{data.language}' is not allowed for this assessment. Allowed: {config_languages}"}

    if await check_coding_already_submitted(student_id, data.assessment_id, data.question_id):
        return {"error": "You have already submitted code for this question"}

    submission_dict = {
        "assessment_id": data.assessment_id,
        "question_id": data.question_id,
        "student_id": student_id,
        "code": data.code,
        "language": data.language,
        "status": "pending",
        "score": None,
        "max_marks": question.get("marks", 0),
        "test_results": [],
        "submitted_at": datetime.utcnow(),
        "created_at": datetime.utcnow()
    }

    result = await db.coding_submissions.insert_one(submission_dict)
    submission_dict["_id"] = result.inserted_id

    return submission_dict


async def get_student_submission_status(student_id: str, assessment_id: str) -> dict:
    """Get submission status for a student on an assessment."""
    db = get_database()

    mcq_submission = await db.mcq_submissions.find_one({
        "student_id": student_id,
        "assessment_id": assessment_id
    })

    coding_submissions = await db.coding_submissions.find({
        "student_id": student_id,
        "assessment_id": assessment_id
    }).to_list(length=100)

    return {
        "assessment_id": assessment_id,
        "mcq_submitted": mcq_submission is not None,
        "mcq_score": mcq_submission.get("score") if mcq_submission else None,
        "mcq_total": mcq_submission.get("total_marks") if mcq_submission else None,
        "mcq_percentage": mcq_submission.get("percentage") if mcq_submission else None,
        "coding_submitted": len(coding_submissions) > 0,
        "coding_submissions": [
            {
                "submission_id": str(s["_id"]),
                "question_id": s["question_id"],
                "status": s["status"],
                "language": s.get("language"),
                "code": s.get("code"),
                "score": s.get("score"),
                "max_marks": s.get("max_marks"),
                "ai_score": s.get("ai_score"),
                "final_score": s.get("final_score"),
                "passed_tests": s.get("passed_tests"),
                "total_tests": s.get("total_tests"),
                # AI evaluation data
                "result_summary": s.get("result_summary", {}),
                "ai_insights": s.get("ai_insights", {}),
                "analysis": s.get("analysis", {}),
                "issues": s.get("issues", {}),
                # Teacher review data
                "teacher_feedback": s.get("teacher_feedback"),
                "reviewed_at": s.get("reviewed_at"),
                "finalized_at": s.get("finalized_at"),
            }
            for s in coding_submissions
        ]
    }


async def get_student_submissions(student_id: str) -> dict:
    """Get all submissions for a student."""
    db = get_database()

    mcq_submissions = await db.mcq_submissions.find({
        "student_id": student_id
    }).sort("submitted_at", -1).to_list(length=100)

    coding_submissions = await db.coding_submissions.find({
        "student_id": student_id
    }).sort("submitted_at", -1).to_list(length=100)

    return {
        "mcq_submissions": mcq_submissions,
        "coding_submissions": coding_submissions
    }
