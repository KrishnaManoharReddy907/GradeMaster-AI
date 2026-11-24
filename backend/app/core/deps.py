"""FastAPI dependencies shared by every router: authentication, roles, ownership.

Role matrix
-----------
* ``admin``                    : everything.
* ``faculty`` / ``teacher`` / ``hod`` (staff): own assessments and their submissions;
  must be approved by an admin first.
* ``student``                  : own submissions, eligible assessments only.
"""

from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.errors import Forbidden, NotFound, Unauthorized
from app.core.security import decode_access_token
from app.database import get_database

STAFF_ROLES = frozenset({"faculty", "teacher", "hod"})
ADMIN_ROLE = "admin"
STUDENT_ROLE = "student"

_bearer = HTTPBearer(auto_error=False)


def to_object_id(value: str, what: str = "resource") -> ObjectId:
    """Parse an ObjectId or raise a 404 (never a 500) for malformed ids."""
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise NotFound(f"{what.capitalize()} not found")


def is_admin(user: dict) -> bool:
    return user.get("role") == ADMIN_ROLE


def is_staff(user: dict) -> bool:
    return user.get("role") in STAFF_ROLES


def is_approved(user: dict) -> bool:
    return bool(user.get("is_approved") or user.get("approved"))


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    if credentials is None or not credentials.credentials:
        raise Unauthorized("Authentication required")

    payload = decode_access_token(credentials.credentials)
    if not payload or not payload.get("sub"):
        raise Unauthorized("Invalid or expired token")

    try:
        user_oid = ObjectId(payload["sub"])
    except (InvalidId, TypeError):
        raise Unauthorized("Invalid token payload")

    user = await get_database().users.find_one({"_id": user_oid})
    if user is None:
        raise Unauthorized("User not found")
    if user.get("is_active", True) is False:
        raise Unauthorized("This account has been deactivated")
    # Revocation: bumping token_version on the user invalidates older tokens.
    if int(payload.get("tv", 0)) != int(user.get("token_version", 0)):
        raise Unauthorized("Session expired, please sign in again")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if not is_admin(user):
        raise Forbidden("Admin access required")
    return user


async def require_staff(user: dict = Depends(get_current_user)) -> dict:
    """Approved teacher/faculty/HOD, or admin."""
    if is_admin(user):
        return user
    if not is_staff(user):
        raise Forbidden("Teacher access required")
    if not is_approved(user):
        raise Forbidden("Your account is awaiting admin approval")
    return user


async def require_student(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != STUDENT_ROLE:
        raise Forbidden("Student access required")
    return user


def ensure_owns_assessment(user: dict, assessment: dict) -> None:
    """Staff may only act on assessments they created; admins on all."""
    if is_admin(user):
        return
    if assessment.get("teacher_id") != str(user["_id"]):
        raise Forbidden("You do not have access to this assessment")


async def load_assessment(assessment_id: str) -> dict:
    assessment = await get_database().assessments.find_one(
        {"_id": to_object_id(assessment_id, "assessment")}
    )
    if not assessment:
        raise NotFound("Assessment not found")
    return assessment


async def load_owned_assessment(assessment_id: str, user: dict) -> dict:
    assessment = await load_assessment(assessment_id)
    ensure_owns_assessment(user, assessment)
    return assessment


async def load_owned_submission(collection: str, submission_id: str, user: dict) -> tuple[dict, dict]:
    """Fetch a submission from ``collection`` and enforce that ``user`` owns its assessment."""
    db = get_database()
    submission = await db[collection].find_one({"_id": to_object_id(submission_id, "submission")})
    if not submission:
        raise NotFound("Submission not found")
    assessment = await load_assessment(submission["assessment_id"])
    ensure_owns_assessment(user, assessment)
    return submission, assessment
