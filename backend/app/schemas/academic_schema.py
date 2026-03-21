from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class DepartmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class DepartmentResponse(BaseModel):
    id: str
    name: str
    created_at: Optional[datetime] = None


class SectionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    year: int = Field(..., ge=1, le=4)
    department_id: str


class SectionResponse(BaseModel):
    id: str
    name: str
    year: int
    department_id: str
    created_at: Optional[datetime] = None


class SubjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    year: int = Field(..., ge=1, le=4)
    department_id: str


class SubjectResponse(BaseModel):
    id: str
    name: str
    year: int
    department_id: str
    created_at: Optional[datetime] = None


class TeacherAssign(BaseModel):
    teacher_id: str
    subject_id: str
    section_ids: List[str]


class TeacherAssignmentResponse(BaseModel):
    id: str
    teacher_id: str
    subject_id: str
    section_ids: List[str]
    created_at: Optional[datetime] = None


class PendingUserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    department_id: Optional[str] = None
    year: Optional[int] = None
    section_id: Optional[str] = None
    approved: bool
    created_at: Optional[datetime] = None


class MessageResponse(BaseModel):
    message: str
