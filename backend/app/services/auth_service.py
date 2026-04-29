import os
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from bson import ObjectId

from app.database import get_database

SECRET_KEY = os.getenv("JWT_SECRET", "supersecret")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = 60


def hash_password(password: str) -> str:
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    password_bytes = plain_password.encode("utf-8")
    hashed_bytes = hashed_password.encode("utf-8")
    return bcrypt.checkpw(password_bytes, hashed_bytes)


def create_access_token(user_id: str, role: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {
        "sub": user_id,
        "role": role,
        "exp": expire
    }
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


async def get_user_by_email(email: str) -> Optional[dict]:
    db = get_database()
    user = await db.users.find_one({"email": email})
    return user


async def get_user_by_id(user_id: str) -> Optional[dict]:
    db = get_database()
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        return user
    except Exception:
        return None


async def resolve_department_id(department_id: Optional[str], department_name: Optional[str]) -> dict:
    """Resolve department to ObjectId string. Returns dict with 'id' or 'error'."""
    db = get_database()

    if department_id:
        try:
            dept = await db.departments.find_one({"_id": ObjectId(department_id)})
            if dept:
                return {"id": str(dept["_id"])}
            return {"error": "Department not found"}
        except Exception:
            return {"error": "Invalid department ID format"}

    if department_name:
        dept = await db.departments.find_one({"name": department_name})
        if dept:
            return {"id": str(dept["_id"])}
        return {"error": f"Department '{department_name}' not found"}

    return {"id": None}


async def resolve_section_id(
    section_id: Optional[str],
    section_name: Optional[str],
    year: Optional[int],
    department_id: Optional[str]
) -> dict:
    """Resolve section to ObjectId string. Returns dict with 'id' or 'error'."""
    db = get_database()

    if section_id:
        try:
            section = await db.sections.find_one({"_id": ObjectId(section_id)})
            if section:
                return {"id": str(section["_id"])}
            return {"error": "Section not found"}
        except Exception:
            return {"error": "Invalid section ID format"}

    if section_name:
        query = {"name": section_name}
        if year:
            query["year"] = year
        if department_id:
            query["department_id"] = department_id

        section = await db.sections.find_one(query)
        if section:
            return {"id": str(section["_id"])}

        if year and department_id:
            return {"error": f"Section '{section_name}' not found for year {year}"}
        return {"error": f"Section '{section_name}' not found"}

    return {"id": None}


async def create_user(user_data) -> dict:
    db = get_database()

    existing_user = await get_user_by_email(user_data.email)
    if existing_user:
        return None

    hashed_password = hash_password(user_data.password)
    role = user_data.role.value if hasattr(user_data.role, "value") else user_data.role

    # Single admin enforcement
    if role == "admin":
        existing_admin = await db.users.find_one({"role": "admin"})
        if existing_admin:
            return {"error": "admin_exists"}

    # Resolve department_id
    dept_result = await resolve_department_id(
        getattr(user_data, 'department_id', None),
        getattr(user_data, 'department_name', None)
    )
    if "error" in dept_result:
        return dept_result
    resolved_department_id = dept_result["id"]

    # Resolve section_id (for students)
    resolved_section_id = None
    if role == "student":
        section_result = await resolve_section_id(
            getattr(user_data, 'section_id', None),
            getattr(user_data, 'section_name', None),
            getattr(user_data, 'year', None),
            resolved_department_id
        )
        if "error" in section_result:
            return section_result
        resolved_section_id = section_result["id"]

    # Set is_approved based on role
    if role in ("teacher", "faculty"):
        is_approved = False
    else:
        is_approved = True  # admin and student are auto-approved

    user_dict = {
        "name": user_data.name,
        "email": user_data.email,
        "password": hashed_password,
        "role": role,
        "department_id": resolved_department_id,
        "year": user_data.year,
        "section_id": resolved_section_id,
        "is_approved": is_approved,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }

    result = await db.users.insert_one(user_dict)
    user_dict["_id"] = result.inserted_id
    return user_dict


async def authenticate_user(email: str, password: str) -> Optional[dict]:
    user = await get_user_by_email(email)
    if not user:
        return None
    if not verify_password(password, user["password"]):
        return None
    return user
