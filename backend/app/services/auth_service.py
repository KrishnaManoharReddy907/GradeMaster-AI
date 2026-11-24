"""User accounts: creation, authentication, academic resolution."""

from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from pymongo.errors import DuplicateKeyError

from app.core.errors import BadRequest, Conflict, Forbidden, Unauthorized
from app.core.security import hash_password, verify_password
from app.database import get_database

# Re-exported for older imports.
from app.core.security import create_access_token, decode_access_token  # noqa: F401


def _now() -> datetime:
    return datetime.now(timezone.utc)


def serialize_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "name": user.get("name", ""),
        "email": user.get("email", ""),
        "role": user.get("role", ""),
        "approved": bool(user.get("is_approved", False)),
        "is_active": user.get("is_active", True),
        "department_id": user.get("department_id"),
        "year": user.get("year"),
        "section_id": user.get("section_id"),
    }


async def get_user_by_email(email: str) -> Optional[dict]:
    return await get_database().users.find_one({"email": email.strip().lower()})


async def get_user_by_id(user_id: str) -> Optional[dict]:
    try:
        return await get_database().users.find_one({"_id": ObjectId(user_id)})
    except (InvalidId, TypeError):
        return None


async def resolve_department_id(department_id: Optional[str], department_name: Optional[str]) -> Optional[str]:
    db = get_database()
    if department_id:
        try:
            dept = await db.departments.find_one({"_id": ObjectId(department_id)})
        except (InvalidId, TypeError):
            raise BadRequest("Invalid department")
        if not dept:
            raise BadRequest("Department not found")
        return str(dept["_id"])
    if department_name:
        dept = await db.departments.find_one({"name": department_name.strip()})
        if not dept:
            raise BadRequest(f"Department '{department_name}' not found")
        return str(dept["_id"])
    return None


async def resolve_section_id(section_id: Optional[str], section_name: Optional[str],
                             year: Optional[int], department_id: Optional[str]) -> Optional[str]:
    db = get_database()
    if section_id:
        try:
            section = await db.sections.find_one({"_id": ObjectId(section_id)})
        except (InvalidId, TypeError):
            raise BadRequest("Invalid section")
        if not section:
            raise BadRequest("Section not found")
        if year and section.get("year") != year:
            raise BadRequest("Section does not belong to the selected year")
        if department_id and section.get("department_id") != department_id:
            raise BadRequest("Section does not belong to the selected department")
        return str(section["_id"])
    if section_name:
        query: dict = {"name": section_name.strip()}
        if year:
            query["year"] = year
        if department_id:
            query["department_id"] = department_id
        section = await db.sections.find_one(query)
        if not section:
            raise BadRequest(f"Section '{section_name}' not found for the selected year and department")
        return str(section["_id"])
    return None


async def _insert_user(doc: dict) -> dict:
    try:
        result = await get_database().users.insert_one(doc)
    except DuplicateKeyError:
        raise Conflict("An account with this email already exists")
    doc["_id"] = result.inserted_id
    return doc


async def create_user(user_data) -> dict:
    """Public self-signup (student or faculty). Faculty need admin approval."""
    if await get_user_by_email(user_data.email):
        raise Conflict("An account with this email already exists")

    role = user_data.role.value
    department_id = await resolve_department_id(user_data.department_id, user_data.department_name)
    section_id = None
    if role == "student":
        section_id = await resolve_section_id(
            user_data.section_id, user_data.section_name, user_data.year, department_id
        )

    now = _now()
    return await _insert_user({
        "name": user_data.name,
        "email": user_data.email,
        "password": hash_password(user_data.password),
        "role": role,
        "department_id": department_id,
        "year": user_data.year if role == "student" else None,
        "section_id": section_id,
        "is_approved": role == "student",
        "is_active": True,
        "token_version": 0,
        "created_at": now,
        "updated_at": now,
    })


async def create_bootstrap_admin(data) -> dict:
    db = get_database()
    if await db.users.find_one({"role": "admin"}):
        raise Forbidden("An administrator already exists. Please sign in.")
    now = _now()
    return await _insert_user({
        "name": data.name, "email": data.email, "password": hash_password(data.password),
        "role": "admin", "department_id": None, "year": None, "section_id": None,
        "is_approved": True, "is_active": True, "token_version": 0,
        "created_at": now, "updated_at": now,
    })


async def create_staff_user(data, created_by: str) -> dict:
    if await get_user_by_email(data.email):
        raise Conflict("An account with this email already exists")
    department_id = await resolve_department_id(data.department_id, None)
    now = _now()
    return await _insert_user({
        "name": data.name, "email": data.email, "password": hash_password(data.password),
        "role": data.role.value, "department_id": department_id, "year": None, "section_id": None,
        "is_approved": True, "is_active": True, "token_version": 0,
        "created_by": created_by, "created_at": now, "updated_at": now,
    })


async def authenticate_user(email: str, password: str) -> dict:
    user = await get_user_by_email(email)
    # Same message whether the email or the password is wrong (no account enumeration).
    if not user or not verify_password(password, user.get("password", "")):
        raise Unauthorized("Invalid email or password")
    if user.get("is_active", True) is False:
        raise Forbidden("This account has been deactivated. Contact your administrator.", code="account_inactive")
    if user.get("role") in ("faculty", "teacher", "hod") and not user.get("is_approved"):
        raise Forbidden("Your account is awaiting admin approval.", code="pending_approval")
    await get_database().users.update_one({"_id": user["_id"]}, {"$set": {"last_login_at": _now()}})
    return user


async def change_password(user: dict, current_password: str, new_password: str) -> None:
    if not verify_password(current_password, user.get("password", "")):
        raise BadRequest("Current password is incorrect")
    await get_database().users.update_one(
        {"_id": user["_id"]},
        {"$set": {"password": hash_password(new_password), "updated_at": _now()},
         "$inc": {"token_version": 1}},
    )
