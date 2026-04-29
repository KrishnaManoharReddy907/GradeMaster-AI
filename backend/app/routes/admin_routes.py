from fastapi import APIRouter, HTTPException, Depends, status
from typing import List

from app.routes.auth_routes import get_current_user
from app.schemas.academic_schema import (
    DepartmentCreate,
    DepartmentResponse,
    SectionCreate,
    SectionResponse,
    SubjectCreate,
    SubjectResponse,
    TeacherAssign,
    TeacherAssignmentResponse,
    PendingUserResponse,
    MessageResponse
)
from app.services.academic_service import (
    create_department,
    get_all_departments,
    create_section,
    get_all_sections,
    create_subject,
    get_all_subjects,
    assign_teacher,
    get_all_teacher_assignments,
    get_pending_users,
    get_approved_teachers,
    approve_user
)
from app.database import get_database

router = APIRouter()


@router.get("/check-setup")
async def check_admin_setup():
    """Check if an admin account exists. Public endpoint — no auth needed."""
    db = get_database()
    admin = await db.users.find_one({"role": "admin"})
    return {
        "admin_exists": admin is not None,
        "setup_required": admin is None
    }


async def admin_required(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


async def authenticated_required(current_user: dict = Depends(get_current_user)) -> dict:
    """Any authenticated user (admin, teacher, faculty, student) can access."""
    return current_user


@router.post("/departments", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_department_route(
    data: DepartmentCreate,
    current_user: dict = Depends(admin_required)
):
    department = await create_department(data)

    if department is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Department already exists"
        )

    return DepartmentResponse(
        id=str(department["_id"]),
        name=department["name"],
        created_at=department.get("created_at")
    )


@router.get("/departments", response_model=List[DepartmentResponse])
async def get_departments_route(current_user: dict = Depends(authenticated_required)):
    departments = await get_all_departments()
    return [
        DepartmentResponse(
            id=str(d["_id"]),
            name=d["name"],
            created_at=d.get("created_at")
        )
        for d in departments
    ]


@router.post("/sections", response_model=SectionResponse, status_code=status.HTTP_201_CREATED)
async def create_section_route(
    data: SectionCreate,
    current_user: dict = Depends(admin_required)
):
    section = await create_section(data)

    if section is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Section already exists"
        )

    if isinstance(section, dict) and "error" in section:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=section["error"]
        )

    return SectionResponse(
        id=str(section["_id"]),
        name=section["name"],
        year=section["year"],
        department_id=section["department_id"],
        created_at=section.get("created_at")
    )


@router.get("/sections", response_model=List[SectionResponse])
async def get_sections_route(current_user: dict = Depends(authenticated_required)):
    sections = await get_all_sections()
    return [
        SectionResponse(
            id=str(s["_id"]),
            name=s["name"],
            year=s["year"],
            department_id=s["department_id"],
            created_at=s.get("created_at")
        )
        for s in sections
    ]


@router.post("/subjects", response_model=SubjectResponse, status_code=status.HTTP_201_CREATED)
async def create_subject_route(
    data: SubjectCreate,
    current_user: dict = Depends(admin_required)
):
    subject = await create_subject(data)

    if subject is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subject already exists"
        )

    if isinstance(subject, dict) and "error" in subject:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=subject["error"]
        )

    return SubjectResponse(
        id=str(subject["_id"]),
        name=subject["name"],
        year=subject["year"],
        department_id=subject["department_id"],
        created_at=subject.get("created_at")
    )


@router.get("/subjects", response_model=List[SubjectResponse])
async def get_subjects_route(current_user: dict = Depends(authenticated_required)):
    subjects = await get_all_subjects()
    return [
        SubjectResponse(
            id=str(s["_id"]),
            name=s["name"],
            year=s["year"],
            department_id=s["department_id"],
            created_at=s.get("created_at")
        )
        for s in subjects
    ]


@router.post("/assign-teacher", response_model=TeacherAssignmentResponse, status_code=status.HTTP_201_CREATED)
async def assign_teacher_route(
    data: TeacherAssign,
    current_user: dict = Depends(admin_required)
):
    assignment = await assign_teacher(data)

    if isinstance(assignment, dict) and "error" in assignment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=assignment["error"]
        )

    return TeacherAssignmentResponse(
        id=str(assignment["_id"]),
        teacher_id=assignment["teacher_id"],
        subject_id=assignment["subject_id"],
        section_ids=assignment["section_ids"],
        created_at=assignment.get("created_at")
    )


@router.get("/teacher-assignments", response_model=List[TeacherAssignmentResponse])
async def get_teacher_assignments_route(current_user: dict = Depends(admin_required)):
    assignments = await get_all_teacher_assignments()
    return [
        TeacherAssignmentResponse(
            id=str(a["_id"]),
            teacher_id=a["teacher_id"],
            subject_id=a["subject_id"],
            section_ids=a["section_ids"],
            created_at=a.get("created_at")
        )
        for a in assignments
    ]


@router.get("/approved-teachers")
async def get_approved_teachers_route(current_user: dict = Depends(admin_required)):
    """Get all approved teachers for the assignment dropdown."""
    teachers = await get_approved_teachers()
    return [
        {
            "id": str(t["_id"]),
            "name": t.get("name", "Unknown"),
            "email": t.get("email", ""),
            "department_id": t.get("department_id"),
        }
        for t in teachers
    ]


@router.get("/pending-users", response_model=List[PendingUserResponse])
async def get_pending_users_route(current_user: dict = Depends(admin_required)):
    users = await get_pending_users()
    return [
        PendingUserResponse(
            id=str(u["_id"]),
            name=u["name"],
            email=u["email"],
            role=u["role"],
            department_id=u.get("department_id"),
            year=u.get("year"),
            section_id=u.get("section_id"),
            approved=u.get("is_approved", False),
            created_at=u.get("created_at")
        )
        for u in users
    ]


@router.put("/approve-user/{user_id}", response_model=MessageResponse)
async def approve_user_route(
    user_id: str,
    current_user: dict = Depends(admin_required)
):
    result = await approve_user(user_id)

    if isinstance(result, dict) and result.get("error") == "not_found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    if isinstance(result, dict) and result.get("error") == "already_approved":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already approved"
        )

    return MessageResponse(message="User approved successfully")
