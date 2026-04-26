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


# Review history entry for teacher score modifications
class ReviewHistoryEntry(BaseModel):
    teacher_id: str
    old_score: float
    new_score: float
    comment: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class CodingSubmissionResponse(BaseModel):
    id: str
    assessment_id: str
    question_id: str
    student_id: str
    language: str
    status: str  # pending, evaluated, reviewed, finalized
    score: Optional[float] = None  # Deprecated: use ai_score or final_score
    
    # AI evaluation scores
    ai_score: Optional[float] = None
    
    # Teacher review fields
    final_score: Optional[float] = None
    teacher_feedback: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    
    # Review history
    review_history: Optional[List[ReviewHistoryEntry]] = None
    
    submitted_at: datetime


# Schema for teacher review submission
class TeacherReviewCreate(BaseModel):
    final_score: float = Field(..., ge=0)
    teacher_feedback: Optional[str] = None
    comment: Optional[str] = None  # Comment for review history


# Schema for detailed submission response (includes all evaluation data)
class CodingSubmissionDetailResponse(BaseModel):
    id: str
    assessment_id: str
    question_id: str
    student_id: str
    code: str
    language: str
    status: str
    
    # Scores
    ai_score: Optional[float] = None
    final_score: Optional[float] = None
    max_marks: Optional[float] = None
    
    # Test results
    passed_tests: Optional[int] = None
    total_tests: Optional[int] = None
    
    # AI analysis
    result_summary: Optional[dict] = None
    analysis: Optional[dict] = None
    issues: Optional[dict] = None
    ai_insights: Optional[dict] = None
    
    # Teacher review
    teacher_feedback: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_history: Optional[List[ReviewHistoryEntry]] = None
    
    # Timestamps
    submitted_at: datetime
    evaluated_at: Optional[datetime] = None


class SubmissionStatusResponse(BaseModel):
    assessment_id: str
    mcq_submitted: bool
    coding_submitted: bool
    manual_submitted: bool = False
    mcq_score: Optional[int] = None
    coding_score: Optional[int] = None
    manual_score: Optional[float] = None


# ── Manual (Handwritten) Submission Schemas ──

class ManualSubmissionCreate(BaseModel):
    assessment_id: str
    answers: dict  # {"Q1": "answer text", "Q2": "answer text"}


class ManualQuestionResult(BaseModel):
    question_id: str
    keyword_score: float
    ai_score: float
    final_score: float
    max_marks: float
    feedback: str = ""
    correctness: str = ""
    completeness: str = ""
    keywords_matched: List[str] = []
    keywords_missed: List[str] = []


class ManualSubmissionResponse(BaseModel):
    id: str
    assessment_id: str
    student_id: str
    status: str  # evaluated, reviewed, finalized
    total_score: float
    total_marks: float
    percentage: float
    results: List[ManualQuestionResult] = []
    submitted_at: datetime
    evaluated_at: Optional[datetime] = None
    
    # Teacher review fields
    teacher_adjusted_score: Optional[float] = None
    teacher_feedback: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None


class ManualTeacherReviewCreate(BaseModel):
    teacher_adjusted_score: float = Field(..., ge=0)
    teacher_feedback: Optional[str] = None
