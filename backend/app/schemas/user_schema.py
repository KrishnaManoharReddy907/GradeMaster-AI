from pydantic import BaseModel, EmailStr, Field, model_validator
from typing import Optional
from enum import Enum


class UserRole(str, Enum):
    STUDENT = "student"
    FACULTY = "faculty"
    HOD = "hod"
    ADMIN = "admin"


class UserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6)
    role: UserRole = UserRole.STUDENT
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    year: Optional[int] = Field(None, ge=1, le=4)
    section_id: Optional[str] = None
    section_name: Optional[str] = None

    @model_validator(mode='after')
    def validate_student_fields(self):
        if self.role == UserRole.STUDENT:
            if not self.year:
                raise ValueError("Year is required for students")
            if not (self.section_id or self.section_name):
                raise ValueError("Section is required for students")
            if not (self.department_id or self.department_name):
                raise ValueError("Department is required for students")
        return self


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    approved: bool = False


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str


class MessageResponse(BaseModel):
    message: str
