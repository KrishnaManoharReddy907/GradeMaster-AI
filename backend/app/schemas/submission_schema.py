from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class AnswerSchema(BaseModel):
    question_id: str
    selected_option_id: str


class MCQSubmissionCreate(BaseModel):
    assessment_id: str
    answers: List[AnswerSchema]


class CodingSubmissionCreate(BaseModel):
    assessment_id: str
    question_id: str
    code: str
    language: str = Field(..., pattern="^(python|java|cpp|c|javascript)$")


class MCQSubmissionResponse(BaseModel):
    id: str
    assessment_id: str
    student_id: str
    score: int
    total_marks: int
    percentage: float
    submitted_at: datetime


class CodingSubmissionResponse(BaseModel):
    id: str
    assessment_id: str
    question_id: str
    student_id: str
    language: str
    status: str
    score: Optional[int] = None
    submitted_at: datetime


class SubmissionStatusResponse(BaseModel):
    assessment_id: str
    mcq_submitted: bool
    coding_submitted: bool
    mcq_score: Optional[int] = None
    coding_score: Optional[int] = None
