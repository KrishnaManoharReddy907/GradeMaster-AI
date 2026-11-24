from enum import Enum
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class UserRole(str, Enum):
    STUDENT = "student"
    FACULTY = "faculty"
    HOD = "hod"
    ADMIN = "admin"


# Roles anyone may self-register as. Staff/admin roles are created by an admin.
SELF_SIGNUP_ROLES = {UserRole.STUDENT, UserRole.FACULTY}


class _EmailNormalized(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class _StrongPassword(BaseModel):
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def _password_strength(cls, value: str) -> str:
        if not any(c.isalpha() for c in value) or not any(c.isdigit() for c in value):
            raise ValueError("Password must contain at least one letter and one number")
        return value


def _clean_name(value: str) -> str:
    value = " ".join(value.split())
    if len(value) < 2:
        raise ValueError("Name is too short")
    return value


class UserCreate(_EmailNormalized, _StrongPassword):
    name: str = Field(..., min_length=2, max_length=100)
    role: UserRole = UserRole.STUDENT
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    year: Optional[int] = Field(None, ge=1, le=4)
    section_id: Optional[str] = None
    section_name: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _clean_name(value)

    @model_validator(mode="after")
    def validate_role_fields(self):
        if self.role not in SELF_SIGNUP_ROLES:
            raise ValueError("You can only sign up as a student or faculty member")
        if self.role == UserRole.STUDENT:
            if not self.year:
                raise ValueError("Year is required for students")
            if not (self.section_id or self.section_name):
                raise ValueError("Section is required for students")
            if not (self.department_id or self.department_name):
                raise ValueError("Department is required for students")
        return self


class AdminBootstrap(_EmailNormalized, _StrongPassword):
    """First-run admin creation (only allowed while no admin exists)."""
    name: str = Field(..., min_length=2, max_length=100)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _clean_name(value)


class StaffCreate(_EmailNormalized, _StrongPassword):
    """Admin-created staff account (faculty or HOD), approved immediately."""
    name: str = Field(..., min_length=2, max_length=100)
    role: UserRole = UserRole.FACULTY
    department_id: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _clean_name(value)

    @field_validator("role")
    @classmethod
    def _staff_only(cls, value: UserRole) -> UserRole:
        if value not in (UserRole.FACULTY, UserRole.HOD):
            raise ValueError("Admins can create faculty or HOD accounts only")
        return value


class UserLogin(_EmailNormalized):
    password: str = Field(..., min_length=1, max_length=128)


class ChangePassword(_StrongPassword):
    current_password: str = Field(..., min_length=1, max_length=128)


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    approved: bool = False
    is_active: bool = True
    department_id: Optional[str] = None
    year: Optional[int] = None
    section_id: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str
    expires_in: int


class MessageResponse(BaseModel):
    message: str
