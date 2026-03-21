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


async def create_user(user_data) -> dict:
    db = get_database()

    existing_user = await get_user_by_email(user_data.email)
    if existing_user:
        return None

    hashed_password = hash_password(user_data.password)

    user_dict = {
        "name": user_data.name,
        "email": user_data.email,
        "password": hashed_password,
        "role": user_data.role.value if hasattr(user_data.role, "value") else user_data.role,
        "department_id": user_data.department_id,
        "year": user_data.year,
        "section_id": user_data.section_id,
        "approved": False,
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
