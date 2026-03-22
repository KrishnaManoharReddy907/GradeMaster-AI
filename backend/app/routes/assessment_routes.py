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


async def teacher_required(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") not in ["teacher", "faculty"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teacher/Faculty access required"
        )
    if not current_user.get("approved"):
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
            instructions=a.get("instructions")
        )
        for a in assessments
    ]
