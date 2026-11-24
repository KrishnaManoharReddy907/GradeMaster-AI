from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class AnswerSchema(BaseModel):
    question_id: str = Field(..., max_length=40)
    selected_option_id: str = Field(..., max_length=20)


class MCQSubmissionCreate(BaseModel):
    assessment_id: str
    answers: List[AnswerSchema] = Field(default_factory=list, max_length=200)


class CodingSubmissionCreate(BaseModel):
    assessment_id: str
    question_id: str = Field(..., max_length=40)
    code: str = Field(..., min_length=1, max_length=100_000)
    language: str = Field(..., pattern="^(python|java|cpp|c|javascript)$")


class MCQSubmissionResponse(BaseModel):
    id: str
    assessment_id: str
    student_id: str
    score: float
    total_marks: float
    percentage: float
    results_visible: bool = False
    submitted_at: datetime


class CodingSubmissionResponse(BaseModel):
    id: str
    assessment_id: str
    question_id: str
    student_id: str
    language: str
    status: str
    job_id: Optional[str] = None
    submitted_at: datetime


class TeacherReviewCreate(BaseModel):
    final_score: float = Field(..., ge=0)
    teacher_feedback: Optional[str] = Field(None, max_length=5000)


class ManualQuestionAdjustment(BaseModel):
    question_id: str
    score: float = Field(..., ge=0)
    comment: Optional[str] = Field(None, max_length=2000)


class ManualTeacherReviewCreate(BaseModel):
    """Teacher review of a handwritten submission.

    Either per-question scores (preferred; the total is derived from them) or a single
    overall adjusted score.
    """
    question_scores: List[ManualQuestionAdjustment] = Field(default_factory=list)
    teacher_adjusted_score: Optional[float] = Field(None, ge=0)
    teacher_feedback: Optional[str] = Field(None, max_length=5000)
    finalize: bool = True


class ManualSubmissionCreate(BaseModel):
    assessment_id: str
    answers: Dict[str, str] = Field(..., min_length=1)
    upload_ids: List[str] = Field(default_factory=list, max_length=20)
    ocr: Optional[dict] = None  # {"avg_confidence": float, "raw_text": str}
