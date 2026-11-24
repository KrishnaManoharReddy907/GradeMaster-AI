from datetime import datetime, timezone, timedelta
from typing import Optional, List
from bson import ObjectId
import os

from app.database import get_database
from app.services.assessment_service import get_assessment_by_id, make_aware

ALLOWED_CODING_LANGUAGES = ["python", "cpp", "java", "javascript"]


async def check_assessment_active(assessment_id: str) -> dict:
    """Check if assessment exists and is currently active.
    
    Students get their full duration even if they start near end_time.
    Grace period: end_time + duration_minutes.
    """
    assessment = await get_assessment_by_id(assessment_id)

    if not assessment:
        return {"error": "Assessment not found"}

    now = datetime.now(timezone.utc)
    start_time = make_aware(assessment["start_time"])
    end_time = make_aware(assessment["end_time"])
    duration_minutes = assessment.get("duration_minutes", 0)

    if now < start_time:
        return {"error": "Assessment has not started yet", "code": "forbidden"}

    # Allow submission up to end_time + duration so students who started
    # near the end of the window still get their full exam duration.
    grace_deadline = end_time + timedelta(minutes=duration_minutes)
    if now > grace_deadline:
        return {"error": "Assessment submission deadline has passed", "code": "forbidden"}

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


async def _generate_mcq_explanations(results: list, mcq_questions: list) -> list:
    """Generate AI explanations for wrong MCQ answers using Gemini.
    
    Includes retry logic with exponential backoff for transient network errors
    (e.g. DNS resolution failures, timeouts).
    """
    import asyncio
    import traceback

    wrong_results = [r for r in results if not r["is_correct"]]
    if not wrong_results:
        # Still mark correct answers with empty explanation
        for r in results:
            if "ai_explanation" not in r:
                r["ai_explanation"] = ""
        return results

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("MCQ AI explanation skipped: GEMINI_API_KEY not set")
        for r in results:
            r["ai_explanation"] = r.get("ai_explanation", "")
        return results

    question_map = {q["question_id"]: q for q in mcq_questions}

    # Build prompt for all wrong answers at once (single API call)
    wrong_items = []
    for r in wrong_results:
        q = question_map.get(r["question_id"], {})
        options = q.get("options", [])
        option_text = {opt["option_id"]: opt.get("text", "") for opt in options}
        wrong_items.append({
            "question_id": r["question_id"],
            "question_text": q.get("question_text", "Unknown"),
            "selected": option_text.get(r["selected_option_id"], r["selected_option_id"]),
            "correct": option_text.get(r["correct_option_id"], r["correct_option_id"]),
        })

    prompt_items = "\n".join(
        f"Q{i+1} ({item['question_id']}): \"{item['question_text']}\"\n"
        f"  Student chose: \"{item['selected']}\"\n"
        f"  Correct answer: \"{item['correct']}\""
        for i, item in enumerate(wrong_items)
    )

    prompt = f"""You are an educational assistant. For each wrong MCQ answer below, write a brief explanation (1-2 sentences) that:
- Explains WHY the correct answer is right
- Explains WHY the student's choice was wrong (if applicable)
- Is educational and helpful, not condescending

{prompt_items}

Return your response in this exact format, one per line:
QID: explanation

Example:
q1: The correct answer is X because... Your choice Y is incorrect because...

Use the exact question_id values shown in parentheses above (like q1, q2, etc)."""

    MAX_RETRIES = 3
    last_error = None

    for attempt in range(MAX_RETRIES):
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    max_output_tokens=2048,
                    temperature=0.3,
                )
            )

            text = response.text.strip()
            # Parse "qid: explanation" lines
            explanations = {}
            for line in text.split("\n"):
                line = line.strip()
                if not line:
                    continue
                if ":" in line:
                    parts = line.split(":", 1)
                    qid = parts[0].strip().lower()
                    explanation = parts[1].strip()
                    if explanation:
                        explanations[qid] = explanation

            # Attach explanations to results
            for r in results:
                if not r["is_correct"]:
                    qid = r["question_id"].lower()
                    r["ai_explanation"] = explanations.get(qid, "")
                else:
                    r["ai_explanation"] = ""

            print(f"MCQ AI explanations generated successfully ({len(explanations)} explanations for {len(wrong_results)} wrong answers)")
            return results

        except Exception as e:
            last_error = e
            error_msg = str(e)
            print(f"MCQ AI explanation attempt {attempt + 1}/{MAX_RETRIES} failed: {error_msg}")

            # Check if it's a retryable network error
            is_network_error = any(keyword in error_msg.lower() for keyword in [
                "getaddrinfo", "connection", "timeout", "temporary failure",
                "name resolution", "network", "dns", "errno 11001",
                "503", "429", "500", "502", "504"
            ])

            if is_network_error and attempt < MAX_RETRIES - 1:
                wait_time = (2 ** attempt) + 1  # 2s, 5s backoff
                print(f"Retrying MCQ AI explanation in {wait_time}s...")
                await asyncio.sleep(wait_time)
            elif not is_network_error:
                # Non-retryable error (e.g. invalid API key, bad request)
                print(f"MCQ AI explanation non-retryable error: {error_msg}")
                traceback.print_exc()
                break

    # All retries exhausted — fallback: empty explanations
    print(f"MCQ AI explanation failed after {MAX_RETRIES} attempts. Last error: {last_error}")
    for r in results:
        if "ai_explanation" not in r:
            r["ai_explanation"] = ""

    return results


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

    # Generate AI explanations for wrong answers
    score_result["results"] = await _generate_mcq_explanations(
        score_result["results"], mcq_questions
    )

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

    manual_submission = await db.manual_submissions.find_one({
        "student_id": student_id,
        "assessment_id": assessment_id
    })

    # Fetch assessment for MCQ question details
    mcq_questions_data = []
    mcq_results = []
    if mcq_submission:
        assessment = await get_assessment_by_id(assessment_id)
        if assessment:
            mcq_questions_raw = assessment.get("mcq_questions", [])
            for q in mcq_questions_raw:
                mcq_questions_data.append({
                    "question_id": q.get("question_id"),
                    "question_text": q.get("question_text", ""),
                    "options": q.get("options", []),
                    "correct_option_id": q.get("correct_option_id"),
                    "marks": q.get("marks", 1),
                    "difficulty": q.get("difficulty", "medium"),
                })

            mcq_results = mcq_submission.get("results", [])

            # Check if AI explanations are missing for wrong answers (old submissions)
            has_wrong = any(not r.get("is_correct") for r in mcq_results)
            has_explanations = any(r.get("ai_explanation") for r in mcq_results)

            if has_wrong and not has_explanations:
                # Regenerate explanations for old submissions
                try:
                    mcq_results = await _generate_mcq_explanations(
                        mcq_results, mcq_questions_raw
                    )
                    # Update DB so we don't regenerate again
                    await db.mcq_submissions.update_one(
                        {"_id": mcq_submission["_id"]},
                        {"$set": {"results": mcq_results}}
                    )
                except Exception as e:
                    print(f"Failed to regenerate MCQ explanations: {e}")
        else:
            mcq_results = mcq_submission.get("results", [])
    
    return {
        "assessment_id": assessment_id,
        "mcq_submitted": mcq_submission is not None,
        "mcq_score": mcq_submission.get("score") if mcq_submission else None,
        "mcq_total": mcq_submission.get("total_marks") if mcq_submission else None,
        "mcq_percentage": mcq_submission.get("percentage") if mcq_submission else None,
        "mcq_results": mcq_results,
        "mcq_questions": mcq_questions_data,
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
        ],
        "manual_submitted": manual_submission is not None,
        "manual_status": manual_submission.get("status", "evaluated") if manual_submission else None,
        "manual_score": manual_submission.get("manual_evaluation", {}).get("total_score") if manual_submission else None,
        "manual_adjusted_score": manual_submission.get("teacher_adjusted_score") if manual_submission else None,
        "manual_total": manual_submission.get("manual_evaluation", {}).get("total_marks") if manual_submission else None,
        "manual_percentage": manual_submission.get("manual_evaluation", {}).get("percentage") if manual_submission else None,
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

    manual_submissions = await db.manual_submissions.find({
        "student_id": student_id
    }).sort("submitted_at", -1).to_list(length=100)

    return {
        "mcq_submissions": mcq_submissions,
        "coding_submissions": coding_submissions,
        "manual_submissions": manual_submissions,
    }
