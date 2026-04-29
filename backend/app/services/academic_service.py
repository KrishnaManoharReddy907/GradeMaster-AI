from datetime import datetime
from typing import Optional, List
from bson import ObjectId

from app.database import get_database


async def create_department(data) -> dict:
    db = get_database()

    existing = await db.departments.find_one({"name": data.name})
    if existing:
        return None

    department_dict = {
        "name": data.name,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }

    result = await db.departments.insert_one(department_dict)
    department_dict["_id"] = result.inserted_id
    return department_dict


async def get_all_departments() -> List[dict]:
    db = get_database()
    departments = await db.departments.find().to_list(length=100)
    return departments


async def get_department_by_id(department_id: str) -> Optional[dict]:
    db = get_database()
    try:
        department = await db.departments.find_one({"_id": ObjectId(department_id)})
        return department
    except Exception:
        return None


async def create_section(data) -> dict:
    db = get_database()

    department = await get_department_by_id(data.department_id)
    if not department:
        return {"error": "Department not found"}

    existing = await db.sections.find_one({
        "name": data.name,
        "year": data.year,
        "department_id": data.department_id
    })
    if existing:
        return None

    section_dict = {
        "name": data.name,
        "year": data.year,
        "department_id": data.department_id,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }

    result = await db.sections.insert_one(section_dict)
    section_dict["_id"] = result.inserted_id
    return section_dict


async def get_all_sections() -> List[dict]:
    db = get_database()
    sections = await db.sections.find().to_list(length=500)
    return sections


async def get_section_by_id(section_id: str) -> Optional[dict]:
    db = get_database()
    try:
        section = await db.sections.find_one({"_id": ObjectId(section_id)})
        return section
    except Exception:
        return None


async def create_subject(data) -> dict:
    db = get_database()

    department = await get_department_by_id(data.department_id)
    if not department:
        return {"error": "Department not found"}

    existing = await db.subjects.find_one({
        "name": data.name,
        "year": data.year,
        "department_id": data.department_id
    })
    if existing:
        return None

    subject_dict = {
        "name": data.name,
        "year": data.year,
        "department_id": data.department_id,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }

    result = await db.subjects.insert_one(subject_dict)
    subject_dict["_id"] = result.inserted_id
    return subject_dict


async def get_all_subjects() -> List[dict]:
    db = get_database()
    subjects = await db.subjects.find().to_list(length=500)
    return subjects


async def get_subject_by_id(subject_id: str) -> Optional[dict]:
    db = get_database()
    try:
        subject = await db.subjects.find_one({"_id": ObjectId(subject_id)})
        return subject
    except Exception:
        return None


async def assign_teacher(data) -> dict:
    db = get_database()

    from app.services.auth_service import get_user_by_id
    teacher = await get_user_by_id(data.teacher_id)

    if not teacher:
        return {"error": "User not found"}

    if teacher.get("role") not in ["teacher", "faculty"]:
        return {"error": "User is not a teacher/faculty"}

    if not (teacher.get("is_approved") or teacher.get("approved")):
        return {"error": "Teacher/faculty is not approved"}

    subject = await get_subject_by_id(data.subject_id)
    if not subject:
        return {"error": "Subject not found"}

    subject_year = subject.get("year")

    for section_id in data.section_ids:
        section = await get_section_by_id(section_id)
        if not section:
            return {"error": f"Section {section_id} not found"}
        if section.get("year") != subject_year:
            return {"error": "Section year mismatch with subject year"}

    existing = await db.teacher_assignments.find_one({
        "teacher_id": data.teacher_id,
        "subject_id": data.subject_id
    })

    if existing:
        await db.teacher_assignments.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "section_ids": data.section_ids,
                "updated_at": datetime.utcnow()
            }}
        )
        existing["section_ids"] = data.section_ids
        return existing

    assignment_dict = {
        "teacher_id": data.teacher_id,
        "subject_id": data.subject_id,
        "section_ids": data.section_ids,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }

    result = await db.teacher_assignments.insert_one(assignment_dict)
    assignment_dict["_id"] = result.inserted_id
    return assignment_dict


async def get_all_teacher_assignments() -> List[dict]:
    db = get_database()
    assignments = await db.teacher_assignments.find().to_list(length=500)
    return assignments


async def get_pending_users() -> List[dict]:
    db = get_database()
    users = await db.users.find({"is_approved": False}).to_list(length=500)
    return users


async def get_approved_teachers() -> List[dict]:
    """Get all approved faculty/teacher users for teacher assignment dropdown."""
    db = get_database()
    teachers = await db.users.find({
        "role": {"$in": ["teacher", "faculty"]},
        "is_approved": True
    }).to_list(length=500)
    return teachers


async def approve_user(user_id: str) -> dict:
    db = get_database()
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            return {"error": "not_found"}

        if user.get("is_approved") is True:
            return {"error": "already_approved"}

        await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"is_approved": True, "updated_at": datetime.utcnow()}}
        )

        return {"success": True}
    except Exception:
        return {"error": "not_found"}
