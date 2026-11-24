from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.deps import get_current_user, require_admin
from app.database import get_database
from app.schemas.academic_schema import (
    DepartmentCreate,
    DepartmentResponse,
    MessageResponse,
    PendingUserResponse,
    SectionCreate,
    SectionResponse,
    SubjectCreate,
    SubjectResponse,
    TeacherAssign,
    TeacherAssignmentResponse,
)
from app.schemas.user_schema import StaffCreate
from app.services import academic_service as svc
from app.services.audit_service import list_audit, record_audit
from app.services.auth_service import create_staff_user, serialize_user
from app.services.system_service import system_health

router = APIRouter()


def _dept(d: dict) -> DepartmentResponse:
    return DepartmentResponse(id=str(d["_id"]), name=d["name"], code=d.get("code"), created_at=d.get("created_at"))


def _section(s: dict) -> SectionResponse:
    return SectionResponse(id=str(s["_id"]), name=s["name"], year=s["year"],
                           department_id=s["department_id"], created_at=s.get("created_at"))


def _subject(s: dict) -> SubjectResponse:
    return SubjectResponse(id=str(s["_id"]), name=s["name"], code=s.get("code"), year=s["year"],
                           department_id=s["department_id"], topics=s.get("topics", []),
                           created_at=s.get("created_at"))


def _assignment(a: dict) -> TeacherAssignmentResponse:
    return TeacherAssignmentResponse(
        id=str(a["_id"]), teacher_id=a["teacher_id"], teacher_name=a.get("teacher_name"),
        subject_id=a["subject_id"], subject_name=a.get("subject_name"),
        section_ids=a.get("section_ids", []), created_at=a.get("created_at"))


@router.get("/check-setup")
async def check_admin_setup():
    """Public: tells the landing page whether first-run admin setup is needed."""
    admin = await get_database().users.find_one({"role": "admin"}, {"_id": 1})
    return {"admin_exists": admin is not None, "setup_required": admin is None,
            "token_required": admin is None and bool(settings.bootstrap_token)}


# ─── Catalogue ────────────────────────────────────────────────────────────

@router.post("/departments", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_department_route(data: DepartmentCreate, admin: dict = Depends(require_admin)):
    dept = await svc.create_department(data)
    await record_audit(admin, "department.create", "department", str(dept["_id"]), {"name": dept["name"]})
    return _dept(dept)


@router.get("/departments", response_model=List[DepartmentResponse])
async def get_departments_route(_: dict = Depends(get_current_user)):
    return [_dept(d) for d in await svc.get_all_departments()]


@router.post("/sections", response_model=SectionResponse, status_code=status.HTTP_201_CREATED)
async def create_section_route(data: SectionCreate, admin: dict = Depends(require_admin)):
    section = await svc.create_section(data)
    await record_audit(admin, "section.create", "section", str(section["_id"]), {"name": section["name"]})
    return _section(section)


@router.get("/sections", response_model=List[SectionResponse])
async def get_sections_route(_: dict = Depends(get_current_user)):
    return [_section(s) for s in await svc.get_all_sections()]


@router.post("/subjects", response_model=SubjectResponse, status_code=status.HTTP_201_CREATED)
async def create_subject_route(data: SubjectCreate, admin: dict = Depends(require_admin)):
    subject = await svc.create_subject(data)
    await record_audit(admin, "subject.create", "subject", str(subject["_id"]), {"name": subject["name"]})
    return _subject(subject)


class TopicsUpdate(BaseModel):
    topics: List[str] = Field(default_factory=list, max_length=100)


@router.put("/subjects/{subject_id}/topics", response_model=SubjectResponse)
async def update_subject_topics_route(subject_id: str, data: TopicsUpdate, admin: dict = Depends(require_admin)):
    cleaned = SubjectCreate(name="x", year=1, department_id="x", topics=data.topics).topics
    subject = await svc.update_subject_topics(subject_id, cleaned)
    await record_audit(admin, "subject.topics", "subject", subject_id, {"topics": cleaned})
    return _subject(subject)


@router.get("/subjects", response_model=List[SubjectResponse])
async def get_subjects_route(_: dict = Depends(get_current_user)):
    return [_subject(s) for s in await svc.get_all_subjects()]


# ─── Teacher assignments ──────────────────────────────────────────────────

@router.post("/assign-teacher", response_model=TeacherAssignmentResponse, status_code=status.HTTP_201_CREATED)
async def assign_teacher_route(data: TeacherAssign, admin: dict = Depends(require_admin)):
    assignment = await svc.assign_teacher(data)
    await record_audit(admin, "assignment.upsert", "teacher_assignment", str(assignment["_id"]),
                       {"teacher_id": data.teacher_id, "subject_id": data.subject_id, "sections": data.section_ids})
    return _assignment(assignment)


@router.get("/teacher-assignments", response_model=List[TeacherAssignmentResponse])
async def get_teacher_assignments_route(_: dict = Depends(require_admin)):
    return [_assignment(a) for a in await svc.get_all_teacher_assignments()]


@router.delete("/teacher-assignments/{assignment_id}", response_model=MessageResponse)
async def delete_teacher_assignment_route(assignment_id: str, admin: dict = Depends(require_admin)):
    await svc.remove_teacher_assignment(assignment_id)
    await record_audit(admin, "assignment.delete", "teacher_assignment", assignment_id)
    return MessageResponse(message="Assignment removed")


@router.get("/approved-teachers")
async def get_approved_teachers_route(_: dict = Depends(require_admin)):
    return [{"id": str(t["_id"]), "name": t.get("name", ""), "email": t.get("email", ""),
             "role": t.get("role"), "department_id": t.get("department_id")}
            for t in await svc.get_approved_teachers()]


# ─── Users ────────────────────────────────────────────────────────────────

@router.get("/pending-users", response_model=List[PendingUserResponse])
async def get_pending_users_route(_: dict = Depends(require_admin)):
    return [PendingUserResponse(
        id=str(u["_id"]), name=u["name"], email=u["email"], role=u["role"],
        department_id=u.get("department_id"), year=u.get("year"), section_id=u.get("section_id"),
        approved=u.get("is_approved", False), created_at=u.get("created_at"))
        for u in await svc.get_pending_users()]


@router.put("/approve-user/{user_id}", response_model=MessageResponse)
async def approve_user_route(user_id: str, admin: dict = Depends(require_admin)):
    user = await svc.approve_user(user_id)
    await record_audit(admin, "user.approve", "user", user_id, {"email": user.get("email")})
    return MessageResponse(message="User approved")


@router.put("/reject-user/{user_id}", response_model=MessageResponse)
async def reject_user_route(user_id: str, admin: dict = Depends(require_admin)):
    user = await svc.reject_user(user_id)
    await record_audit(admin, "user.reject", "user", user_id, {"email": user.get("email")})
    return MessageResponse(message="Sign-up rejected")


@router.get("/users")
async def list_users_route(
    role: Optional[str] = Query(None, pattern="^(student|faculty|teacher|hod|admin|staff)$"),
    search: Optional[str] = Query(None, max_length=100),
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
    _: dict = Depends(require_admin),
):
    result = await svc.list_users(role, search, skip, limit)
    return {"total": result["total"], "users": [serialize_user(u) | {
        "created_at": u.get("created_at"), "last_login_at": u.get("last_login_at"),
        "rejected": u.get("rejected", False)} for u in result["users"]]}


@router.post("/staff", status_code=status.HTTP_201_CREATED)
async def create_staff_route(data: StaffCreate, admin: dict = Depends(require_admin)):
    user = await create_staff_user(data, str(admin["_id"]))
    await record_audit(admin, "user.create_staff", "user", str(user["_id"]), {"role": user["role"]})
    return serialize_user(user)


class ActiveUpdate(BaseModel):
    is_active: bool


@router.put("/users/{user_id}/status", response_model=MessageResponse)
async def set_user_status_route(user_id: str, data: ActiveUpdate, admin: dict = Depends(require_admin)):
    await svc.set_user_active(user_id, data.is_active, str(admin["_id"]))
    await record_audit(admin, "user.activate" if data.is_active else "user.deactivate", "user", user_id)
    return MessageResponse(message="Account activated" if data.is_active else "Account deactivated")


# ─── Governance ───────────────────────────────────────────────────────────

@router.get("/audit-log")
async def audit_log_route(
    action: Optional[str] = Query(None, max_length=60),
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
    _: dict = Depends(require_admin),
):
    return await list_audit(limit=limit, skip=skip, action=action)


@router.get("/system-health")
async def system_health_route(_: dict = Depends(require_admin)):
    return await system_health()


@router.get("/overview")
async def admin_overview_route(_: dict = Depends(require_admin)):
    db = get_database()
    roles = {r["_id"]: r["n"] async for r in db.users.aggregate([{"$group": {"_id": "$role", "n": {"$sum": 1}}}])}
    by_type = {r["_id"]: r["n"] async for r in db.assessments.aggregate(
        [{"$group": {"_id": "$assessment_type", "n": {"$sum": 1}}}])}
    return {
        "users": roles,
        "pending_approvals": await db.users.count_documents({"is_approved": False, "rejected": {"$ne": True}}),
        "departments": await db.departments.count_documents({}),
        "sections": await db.sections.count_documents({}),
        "subjects": await db.subjects.count_documents({}),
        "assessments": by_type,
        "submissions": {
            "mcq": await db.mcq_submissions.count_documents({}),
            "coding": await db.coding_submissions.count_documents({}),
            "manual": await db.manual_submissions.count_documents({}),
        },
        "pending_reviews": {
            "coding": await db.coding_submissions.count_documents({"status": {"$in": ["pending", "evaluated", "reviewed"]}}),
            "manual": await db.manual_submissions.count_documents({"status": {"$ne": "finalized"}}),
        },
    }
