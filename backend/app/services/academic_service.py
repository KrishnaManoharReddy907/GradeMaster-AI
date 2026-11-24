"""Academic catalogue (departments, sections, subjects), teacher assignments and user administration."""

import re
from datetime import datetime, timezone
from typing import List, Optional

from bson import ObjectId
from bson.errors import InvalidId
from pymongo.errors import DuplicateKeyError

from app.core.errors import BadRequest, Conflict, NotFound
from app.database import get_database

STAFF_ROLES = ["teacher", "faculty", "hod"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _oid(value: str, what: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise NotFound(f"{what} not found")


async def _get(collection: str, value: str, what: str) -> dict:
    doc = await get_database()[collection].find_one({"_id": _oid(value, what)})
    if not doc:
        raise NotFound(f"{what} not found")
    return doc


# ─── Departments / sections / subjects ────────────────────────────────────

async def create_department(data) -> dict:
    db = get_database()
    if await db.departments.find_one({"name": {"$regex": f"^{re.escape(data.name)}$", "$options": "i"}}):
        raise Conflict("A department with this name already exists")
    doc = {"name": data.name, "code": (data.code or "").upper() or None, "created_at": _now(), "updated_at": _now()}
    try:
        doc["_id"] = (await db.departments.insert_one(doc)).inserted_id
    except DuplicateKeyError:
        raise Conflict("A department with this name already exists")
    return doc


async def get_all_departments() -> List[dict]:
    return await get_database().departments.find().sort("name", 1).to_list(500)


async def create_section(data) -> dict:
    db = get_database()
    await _get("departments", data.department_id, "Department")
    doc = {"name": data.name, "year": data.year, "department_id": data.department_id,
           "created_at": _now(), "updated_at": _now()}
    try:
        doc["_id"] = (await db.sections.insert_one(doc)).inserted_id
    except DuplicateKeyError:
        raise Conflict("This section already exists for that year and department")
    return doc


async def get_all_sections() -> List[dict]:
    return await get_database().sections.find().sort([("year", 1), ("name", 1)]).to_list(1000)


async def create_subject(data) -> dict:
    db = get_database()
    await _get("departments", data.department_id, "Department")
    doc = {"name": data.name, "code": (data.code or "").upper() or None, "year": data.year,
           "department_id": data.department_id, "topics": data.topics,
           "created_at": _now(), "updated_at": _now()}
    try:
        doc["_id"] = (await db.subjects.insert_one(doc)).inserted_id
    except DuplicateKeyError:
        raise Conflict("This subject already exists for that year and department")
    return doc


async def update_subject_topics(subject_id: str, topics: List[str]) -> dict:
    db = get_database()
    subject = await _get("subjects", subject_id, "Subject")
    await db.subjects.update_one({"_id": subject["_id"]}, {"$set": {"topics": topics, "updated_at": _now()}})
    subject["topics"] = topics
    return subject


async def get_all_subjects() -> List[dict]:
    return await get_database().subjects.find().sort([("year", 1), ("name", 1)]).to_list(1000)


# ─── Teacher assignments ──────────────────────────────────────────────────

async def assign_teacher(data) -> dict:
    db = get_database()
    teacher = await _get("users", data.teacher_id, "Teacher")
    if teacher.get("role") not in STAFF_ROLES:
        raise BadRequest("Selected user is not a teacher")
    if not teacher.get("is_approved"):
        raise BadRequest("Approve this teacher before assigning subjects")
    if teacher.get("is_active", True) is False:
        raise BadRequest("This teacher account is deactivated")

    subject = await _get("subjects", data.subject_id, "Subject")
    section_ids = list(dict.fromkeys(data.section_ids))
    sections = await db.sections.find({"_id": {"$in": [_oid(s, "Section") for s in section_ids]}}).to_list(None)
    if len(sections) != len(section_ids):
        raise NotFound("One or more sections were not found")
    for section in sections:
        if section.get("year") != subject.get("year"):
            raise BadRequest(f"Section {section['name']} is year {section['year']} but the subject is year {subject['year']}")
        if section.get("department_id") != subject.get("department_id"):
            raise BadRequest(f"Section {section['name']} belongs to a different department")

    now = _now()
    doc = await db.teacher_assignments.find_one_and_update(
        {"teacher_id": data.teacher_id, "subject_id": data.subject_id},
        {"$set": {"section_ids": section_ids, "updated_at": now}, "$setOnInsert": {"created_at": now}},
        upsert=True, return_document=True,
    )
    doc["teacher_name"] = teacher.get("name")
    doc["subject_name"] = subject.get("name")
    return doc


async def get_all_teacher_assignments() -> List[dict]:
    db = get_database()
    rows = await db.teacher_assignments.find().sort("created_at", -1).to_list(2000)
    teacher_ids = {r["teacher_id"] for r in rows}
    subject_ids = {r["subject_id"] for r in rows}
    teachers = {str(u["_id"]): u.get("name") for u in await db.users.find(
        {"_id": {"$in": [ObjectId(t) for t in teacher_ids if ObjectId.is_valid(t)]}}, {"name": 1}).to_list(None)}
    subjects = {str(s["_id"]): s.get("name") for s in await db.subjects.find(
        {"_id": {"$in": [ObjectId(s) for s in subject_ids if ObjectId.is_valid(s)]}}, {"name": 1}).to_list(None)}
    for r in rows:
        r["teacher_name"] = teachers.get(r["teacher_id"])
        r["subject_name"] = subjects.get(r["subject_id"])
    return rows


async def remove_teacher_assignment(assignment_id: str) -> None:
    result = await get_database().teacher_assignments.delete_one({"_id": _oid(assignment_id, "Assignment")})
    if not result.deleted_count:
        raise NotFound("Assignment not found")


# ─── User administration ──────────────────────────────────────────────────

async def get_pending_users() -> List[dict]:
    return await get_database().users.find(
        {"is_approved": False, "rejected": {"$ne": True}}).sort("created_at", 1).to_list(500)


async def get_approved_teachers() -> List[dict]:
    return await get_database().users.find(
        {"role": {"$in": STAFF_ROLES}, "is_approved": True, "is_active": {"$ne": False}}
    ).sort("name", 1).to_list(1000)


async def approve_user(user_id: str) -> dict:
    db = get_database()
    user = await _get("users", user_id, "User")
    if user.get("is_approved"):
        raise BadRequest("User is already approved")
    await db.users.update_one({"_id": user["_id"]},
                              {"$set": {"is_approved": True, "rejected": False, "updated_at": _now()}})
    return user


async def reject_user(user_id: str) -> dict:
    """Reject a pending sign-up. The account is kept (deactivated) for the audit trail."""
    db = get_database()
    user = await _get("users", user_id, "User")
    if user.get("is_approved"):
        raise BadRequest("Approved users cannot be rejected; deactivate them instead")
    await db.users.update_one({"_id": user["_id"]}, {
        "$set": {"rejected": True, "is_active": False, "updated_at": _now()},
        "$inc": {"token_version": 1}})
    return user


async def set_user_active(user_id: str, active: bool, acting_admin_id: str) -> dict:
    db = get_database()
    user = await _get("users", user_id, "User")
    if str(user["_id"]) == acting_admin_id:
        raise BadRequest("You cannot change the status of your own account")
    update = {"$set": {"is_active": active, "updated_at": _now()}}
    if not active:
        update["$inc"] = {"token_version": 1}  # revoke existing sessions
    await db.users.update_one({"_id": user["_id"]}, update)
    user["is_active"] = active
    return user


async def list_users(role: Optional[str] = None, search: Optional[str] = None,
                     skip: int = 0, limit: int = 50) -> dict:
    db = get_database()
    query: dict = {}
    if role:
        query["role"] = {"$in": STAFF_ROLES} if role == "staff" else role
    if search:
        pattern = re.escape(search.strip())
        query["$or"] = [{"name": {"$regex": pattern, "$options": "i"}},
                        {"email": {"$regex": pattern, "$options": "i"}}]
    total = await db.users.count_documents(query)
    users = await db.users.find(query, {"password": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"total": total, "users": users}
