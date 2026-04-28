from fastapi import APIRouter, HTTPException, Depends, status
from typing import List

from app.routes.auth_routes import get_current_user
from app.schemas.assessment_schema import (
    AssessmentCreate,
    AssessmentResponse,
    AssessmentDetailResponse,
    StudentAssessmentResponse
)
from app.services.assessment_service import (
    create_assessment,
    get_teacher_assessments,
    get_student_assessments,
    get_assessment_by_id
)

router = APIRouter()


# Allowed roles for evaluator access
EVALUATOR_ROLES = ["admin", "teacher", "faculty"]


async def teacher_required(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") not in EVALUATOR_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teacher, faculty, or admin access required"
        )
    # Skip approval check for admin
    if current_user.get("role") != "admin" and not (current_user.get("is_approved") or current_user.get("approved")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account not approved"
        )
    return current_user


async def student_required(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student access required"
        )
    return current_user


@router.post("/teacher/assessments", response_model=AssessmentResponse, status_code=status.HTTP_201_CREATED)
async def create_assessment_route(
    data: AssessmentCreate,
    current_user: dict = Depends(teacher_required)
):
    teacher_id = str(current_user["_id"])
    assessment = await create_assessment(teacher_id, data)

    if isinstance(assessment, dict) and "error" in assessment:
        if assessment.get("code") == "forbidden":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=assessment["error"]
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=assessment["error"]
        )

    return AssessmentResponse(
        id=str(assessment["_id"]),
        title=assessment["title"],
        description=assessment.get("description"),
        subject_id=assessment["subject_id"],
        section_ids=assessment["section_ids"],
        assessment_type=assessment["assessment_type"],
        duration_minutes=assessment["duration_minutes"],
        total_marks=assessment["total_marks"],
        start_time=assessment["start_time"],
        end_time=assessment["end_time"],
        teacher_id=assessment["teacher_id"],
        status=assessment["status"],
        release_questions_after_deadline=assessment.get("release_questions_after_deadline", False),
        created_at=assessment.get("created_at")
    )


@router.get("/teacher/assessments", response_model=List[AssessmentResponse])
async def get_teacher_assessments_route(current_user: dict = Depends(teacher_required)):
    teacher_id = str(current_user["_id"])
    assessments = await get_teacher_assessments(teacher_id)

    return [
        AssessmentResponse(
            id=str(a["_id"]),
            title=a["title"],
            description=a.get("description"),
            subject_id=a["subject_id"],
            section_ids=a["section_ids"],
            assessment_type=a["assessment_type"],
            duration_minutes=a["duration_minutes"],
            total_marks=a["total_marks"],
            start_time=a["start_time"],
            end_time=a["end_time"],
            teacher_id=a["teacher_id"],
            status=a["status"],
            release_questions_after_deadline=a.get("release_questions_after_deadline", False),
            created_at=a.get("created_at")
        )
        for a in assessments
    ]


@router.get("/teacher/assessments/{assessment_id}", response_model=AssessmentDetailResponse)
async def get_teacher_assessment_detail_route(
    assessment_id: str,
    current_user: dict = Depends(teacher_required)
):
    teacher_id = str(current_user["_id"])
    assessment = await get_assessment_by_id(assessment_id)

    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found"
        )

    if assessment["teacher_id"] != teacher_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view this assessment"
        )

    return AssessmentDetailResponse(
        id=str(assessment["_id"]),
        title=assessment["title"],
        description=assessment.get("description"),
        subject_id=assessment["subject_id"],
        section_ids=assessment["section_ids"],
        assessment_type=assessment["assessment_type"],
        duration_minutes=assessment["duration_minutes"],
        total_marks=assessment["total_marks"],
        start_time=assessment["start_time"],
        end_time=assessment["end_time"],
        teacher_id=assessment["teacher_id"],
        mcq_questions=assessment.get("mcq_questions", []),
        coding_questions=assessment.get("coding_questions", []),
        coding_config=assessment.get("coding_config"),
        rules=assessment.get("rules", {}),
        instructions=assessment.get("instructions"),
        status=assessment["status"],
        created_at=assessment.get("created_at")
    )


@router.get("/student/assessments", response_model=List[StudentAssessmentResponse])
async def get_student_assessments_route(current_user: dict = Depends(student_required)):
    assessments = await get_student_assessments(current_user)

    return [
        StudentAssessmentResponse(
            id=str(a["_id"]),
            title=a["title"],
            description=a.get("description"),
            subject_id=a["subject_id"],
            assessment_type=a["assessment_type"],
            duration_minutes=a["duration_minutes"],
            total_marks=a["total_marks"],
            start_time=a["start_time"],
            end_time=a["end_time"],
            status=a["status"],
            instructions=a.get("instructions"),
            release_questions_after_deadline=a.get("release_questions_after_deadline", False)
        )
        for a in assessments
    ]


@router.get("/student/assessments/{assessment_id}")
async def get_student_assessment_detail_route(
    assessment_id: str,
    current_user: dict = Depends(student_required)
):
    """
    Get assessment details for a student including questions.
    MCQ questions are returned without correct_option_id.
    Coding questions are returned without hidden test cases.
    """
    assessment = await get_assessment_by_id(assessment_id)

    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found"
        )

    # Verify student is eligible (section match)
    student_section_id = current_user.get("section_id")
    if student_section_id not in assessment.get("section_ids", []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not eligible for this assessment"
        )

    # Strip answer keys from MCQ questions
    safe_mcq_questions = []
    for q in assessment.get("mcq_questions", []):
        safe_mcq_questions.append({
            "question_id": q["question_id"],
            "question_text": q["question_text"],
            "options": [{"option_id": o["option_id"], "text": o["text"]} for o in q.get("options", [])],
            "marks": q.get("marks", 1),
            "difficulty": q.get("difficulty", "medium"),
        })

    # Strip hidden test cases from coding questions
    safe_coding_questions = []
    for q in assessment.get("coding_questions", []):
        safe_coding_questions.append({
            "question_id": q["question_id"],
            "title": q["title"],
            "problem_statement": q["problem_statement"],
            "input_format": q.get("input_format", ""),
            "output_format": q.get("output_format", ""),
            "constraints": q.get("constraints", ""),
            "sample_input": q.get("sample_input", ""),
            "sample_output": q.get("sample_output", ""),
            "marks": q.get("marks", 1),
            "difficulty": q.get("difficulty", "medium"),
        })

    # Strip model answers/keywords from manual questions (student should only see question text + marks)
    safe_manual_questions = []
    for q in assessment.get("manual_questions", []):
        safe_manual_questions.append({
            "question_id": q.get("question_id", ""),
            "question_text": q.get("question_text", ""),
            "marks": q.get("marks", 1),
        })

    return {
        "id": str(assessment["_id"]),
        "title": assessment["title"],
        "description": assessment.get("description"),
        "subject_id": assessment["subject_id"],
        "assessment_type": assessment["assessment_type"],
        "duration_minutes": assessment.get("duration_minutes"),
        "total_marks": assessment["total_marks"],
        "start_time": assessment.get("start_time"),
        "end_time": assessment.get("end_time"),
        "status": assessment.get("status", "active"),
        "instructions": assessment.get("instructions"),
        "mcq_questions": safe_mcq_questions,
        "coding_questions": safe_coding_questions,
        "manual_questions": safe_manual_questions,
        "coding_config": assessment.get("coding_config"),
        "rules": assessment.get("rules", {}),
    }


@router.get("/student/assessments/{assessment_id}/review-questions")
async def get_ended_assessment_questions_route(
    assessment_id: str,
    current_user: dict = Depends(student_required)
):
    """
    Get full question paper for ended assessments (read-only, for practice).
    Only available if teacher enabled release_questions_after_deadline.
    MCQ questions include correct answers since the exam is over.
    """
    assessment = await get_assessment_by_id(assessment_id)

    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found"
        )

    # Check student eligibility
    student_section_id = current_user.get("section_id")
    if student_section_id not in assessment.get("section_ids", []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not eligible for this assessment"
        )

    # Check if teacher allowed question release
    if not assessment.get("release_questions_after_deadline", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The teacher has not released the question paper for this assessment"
        )

    # Check if assessment has ended
    from app.services.assessment_service import make_aware
    from datetime import datetime, timezone
    end_time = assessment.get("end_time")
    if end_time:
        end_time = make_aware(end_time)
    now = datetime.now(timezone.utc)

    if not end_time or now < end_time:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Questions can only be viewed after the assessment has ended"
        )

    # MCQ: include correct answers (exam is over)
    mcq_questions = []
    for q in assessment.get("mcq_questions", []):
        mcq_questions.append({
            "question_id": q["question_id"],
            "question_text": q["question_text"],
            "options": q.get("options", []),
            "correct_option_id": q.get("correct_option_id"),
            "marks": q.get("marks", 1),
            "difficulty": q.get("difficulty", "medium"),
        })

    # Coding: include full details
    coding_questions = []
    for q in assessment.get("coding_questions", []):
        coding_questions.append({
            "question_id": q["question_id"],
            "title": q["title"],
            "problem_statement": q["problem_statement"],
            "input_format": q.get("input_format", ""),
            "output_format": q.get("output_format", ""),
            "constraints": q.get("constraints", ""),
            "sample_input": q.get("sample_input", ""),
            "sample_output": q.get("sample_output", ""),
            "marks": q.get("marks", 1),
            "difficulty": q.get("difficulty", "medium"),
        })

    # Manual: include full question text
    manual_questions = []
    for q in assessment.get("manual_questions", []):
        manual_questions.append({
            "question_id": q.get("question_id", ""),
            "question_text": q.get("question_text", ""),
            "marks": q.get("marks", 1),
        })

    return {
        "id": str(assessment["_id"]),
        "title": assessment["title"],
        "description": assessment.get("description"),
        "assessment_type": assessment["assessment_type"],
        "total_marks": assessment["total_marks"],
        "duration_minutes": assessment.get("duration_minutes"),
        "mcq_questions": mcq_questions,
        "coding_questions": coding_questions,
        "manual_questions": manual_questions,
    }
