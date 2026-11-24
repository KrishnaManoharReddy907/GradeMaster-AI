from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


def _clean(value: str) -> str:
    value = " ".join(value.split())
    if not value:
        raise ValueError("Name cannot be empty")
    return value


class DepartmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    code: Optional[str] = Field(None, max_length=16)

    _n = field_validator("name")(classmethod(lambda cls, v: _clean(v)))


class DepartmentResponse(BaseModel):
    id: str
    name: str
    code: Optional[str] = None
    created_at: Optional[datetime] = None


class SectionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    year: int = Field(..., ge=1, le=4)
    department_id: str

    _n = field_validator("name")(classmethod(lambda cls, v: _clean(v)))


class SectionResponse(BaseModel):
    id: str
    name: str
    year: int
    department_id: str
    created_at: Optional[datetime] = None


class SubjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    code: Optional[str] = Field(None, max_length=20)
    year: int = Field(..., ge=1, le=4)
    department_id: str
    topics: List[str] = Field(default_factory=list, max_length=100)

    _n = field_validator("name")(classmethod(lambda cls, v: _clean(v)))

    @field_validator("topics")
    @classmethod
    def _topics(cls, value: List[str]) -> List[str]:
        seen, out = set(), []
        for t in value:
            t = " ".join(t.split())[:60]
            if t and t.lower() not in seen:
                seen.add(t.lower())
                out.append(t)
        return out


class SubjectResponse(BaseModel):
    id: str
    name: str
    code: Optional[str] = None
    year: int
    department_id: str
    topics: List[str] = []
    created_at: Optional[datetime] = None


class TeacherAssign(BaseModel):
    teacher_id: str
    subject_id: str
    section_ids: List[str] = Field(..., min_length=1)


class TeacherAssignmentResponse(BaseModel):
    id: str
    teacher_id: str
    teacher_name: Optional[str] = None
    subject_id: str
    subject_name: Optional[str] = None
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
