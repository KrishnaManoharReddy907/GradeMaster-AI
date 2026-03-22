from datetime import datetime, timezone
from typing import Optional, List
from bson import ObjectId

from app.database import get_database


async def validate_teacher_assignment(teacher_id: str, subject_id: str, section_ids: List[str]) -> dict:
    db = get_database()

    assignment = await db.teacher_assignments.find_one({
        "teacher_id": teacher_id,
        "subject_id": subject_id
    })

    if not assignment:
        return {"error": "You are not assigned to this subject", "code": "forbidden"}

    assigned_sections = set(assignment.get("section_ids", []))
    requested_sections = set(section_ids)

    if not requested_sections.issubset(assigned_sections):
        unassigned = requested_sections - assigned_sections
        return {"error": f"You are not assigned to sections: {list(unassigned)}", "code": "forbidden"}

    return {"valid": True}


def make_aware(dt: datetime) -> datetime:
    """Convert naive datetime to UTC aware datetime."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def calculate_assessment_status(start_time: datetime, end_time: datetime) -> str:
    now = datetime.now(timezone.utc)
    start = make_aware(start_time)
    end = make_aware(end_time)

    if now < start:
        return "scheduled"
    elif now >= start and now <= end:
        return "active"
    else:
        return "completed"


async def create_assessment(teacher_id: str, data) -> dict:
    db = get_database()

    now = datetime.now(timezone.utc)
    start_time = make_aware(data.start_time)
    end_time = make_aware(data.end_time)

    if start_time <= now:
        return {"error": "Start time must be in the future"}

    if start_time >= end_time:
        return {"error": "End time must be after start time"}

    validation = await validate_teacher_assignment(
        teacher_id,
        data.subject_id,
        data.section_ids
    )

    if "error" in validation:
        return validation

    subject = await db.subjects.find_one({"_id": ObjectId(data.subject_id)})
    if not subject:
        return {"error": "Subject not found"}

    subject_year = subject.get("year")

    for section_id in data.section_ids:
        try:
            section = await db.sections.find_one({"_id": ObjectId(section_id)})
            if not section:
                return {"error": f"Section {section_id} not found"}
            if section.get("year") != subject_year:
                return {"error": f"Section {section_id} year does not match subject year"}
        except Exception:
            return {"error": f"Invalid section ID: {section_id}"}

    mcq_questions = []
    if data.mcq_questions:
        for q in data.mcq_questions:
            mcq_questions.append(q.model_dump())

    coding_questions = []
    if data.coding_questions:
        for q in data.coding_questions:
            coding_questions.append(q.model_dump())

    assessment_dict = {
        "title": data.title,
        "description": data.description,
        "subject_id": data.subject_id,
        "section_ids": data.section_ids,
        "year": subject_year,
        "assessment_type": data.assessment_type.value,
        "duration_minutes": data.duration_minutes,
        "total_marks": data.total_marks,
        "start_time": data.start_time,
        "end_time": data.end_time,
        "teacher_id": teacher_id,
        "mcq_questions": mcq_questions,
        "coding_questions": coding_questions,
        "coding_config": data.coding_config.model_dump() if data.coding_config else None,
        "rules": data.rules.model_dump(),
        "instructions": data.instructions,
        "status": calculate_assessment_status(data.start_time, data.end_time),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }

    result = await db.assessments.insert_one(assessment_dict)
    assessment_dict["_id"] = result.inserted_id
    return assessment_dict


async def get_teacher_assessments(teacher_id: str) -> List[dict]:
    db = get_database()

    assessments = await db.assessments.find({
        "teacher_id": teacher_id
    }).sort("created_at", -1).to_list(length=500)

    for assessment in assessments:
        assessment["status"] = calculate_assessment_status(
            assessment["start_time"],
            assessment["end_time"]
        )

    return assessments


async def get_assessment_by_id(assessment_id: str) -> Optional[dict]:
    db = get_database()
    try:
        assessment = await db.assessments.find_one({"_id": ObjectId(assessment_id)})
        if assessment:
            assessment["status"] = calculate_assessment_status(
                assessment["start_time"],
                assessment["end_time"]
            )
        return assessment
    except Exception:
        return None


async def get_student_assessments(student: dict) -> List[dict]:
    db = get_database()

    section_id = student.get("section_id")
    student_year = student.get("year")

    if not section_id or not student_year:
        return []

    try:
        section = await db.sections.find_one({"_id": ObjectId(section_id)})
    except Exception:
        return []

    if not section:
        return []

    now = datetime.now(timezone.utc)

    assessments = await db.assessments.find({
        "section_ids": {"$in": [section_id]},
        "year": student_year
    }).sort("start_time", -1).to_list(length=500)

    result = []
    for assessment in assessments:
        start_time = make_aware(assessment["start_time"])
        end_time = make_aware(assessment["end_time"])

        if now < start_time or now > end_time:
            continue

        assessment["status"] = "active"
        safe_assessment = {
            "_id": assessment["_id"],
            "title": assessment["title"],
            "description": assessment.get("description"),
            "subject_id": assessment["subject_id"],
            "assessment_type": assessment["assessment_type"],
            "duration_minutes": assessment["duration_minutes"],
            "total_marks": assessment["total_marks"],
            "start_time": assessment["start_time"],
            "end_time": assessment["end_time"],
            "status": assessment["status"],
            "instructions": assessment.get("instructions")
        }
        result.append(safe_assessment)

    return result


async def update_assessment(assessment_id: str, teacher_id: str, data: dict) -> dict:
    db = get_database()

    assessment = await get_assessment_by_id(assessment_id)
    if not assessment:
        return {"error": "Assessment not found"}

    if assessment["teacher_id"] != teacher_id:
        return {"error": "You are not authorized to update this assessment"}

    if assessment["status"] == "completed":
        return {"error": "Cannot update completed assessment"}

    update_data = {k: v for k, v in data.items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()

    await db.assessments.update_one(
        {"_id": ObjectId(assessment_id)},
        {"$set": update_data}
    )

    return {"success": True}


async def delete_assessment(assessment_id: str, teacher_id: str) -> dict:
    db = get_database()

    assessment = await get_assessment_by_id(assessment_id)
    if not assessment:
        return {"error": "Assessment not found"}

    if assessment["teacher_id"] != teacher_id:
        return {"error": "You are not authorized to delete this assessment"}

    if assessment["status"] == "active":
        return {"error": "Cannot delete active assessment"}

    await db.assessments.delete_one({"_id": ObjectId(assessment_id)})
    return {"success": True}
