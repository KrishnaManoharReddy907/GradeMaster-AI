from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class AssessmentType(str, Enum):
    MCQ = "mcq"
    CODING = "coding"
    MIXED = "mixed"
    MANUAL = "manual"


class DifficultyLevel(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class MCQOptionSchema(BaseModel):
    option_id: str
    text: str


class MCQQuestionSchema(BaseModel):
    question_id: str
    question_text: str
    options: List[MCQOptionSchema]
    correct_option_id: str
    marks: int = Field(..., ge=1)
    difficulty: DifficultyLevel = DifficultyLevel.MEDIUM


class TestCaseSchema(BaseModel):
    input: str
    expected_output: str
    is_hidden: bool = False


class CodingQuestionSchema(BaseModel):
    question_id: str
    title: str
    problem_statement: str
    input_format: str
    output_format: str
    constraints: str
    sample_input: str
    sample_output: str
    test_cases: List[TestCaseSchema]
    marks: int = Field(..., ge=1)
    difficulty: DifficultyLevel = DifficultyLevel.MEDIUM
    time_limit_seconds: int = Field(default=2, ge=1, le=30)
    memory_limit_mb: int = Field(default=256, ge=64, le=512)


class ManualQuestionSchema(BaseModel):
    question_id: str
    question_text: str
    model_answer: str
    keywords: List[str] = []
    marks: int = Field(..., ge=1)


class CodingConfigSchema(BaseModel):
    allowed_languages: List[str] = ["python", "java", "cpp", "c"]
    enable_auto_grading: bool = True
    partial_marking: bool = False


class RulesSchema(BaseModel):
    shuffle_questions: bool = False
    shuffle_options: bool = False
    show_result_immediately: bool = False
    allow_back_navigation: bool = True
    max_attempts: int = Field(default=1, ge=1, le=5)
    proctoring_enabled: bool = False
    full_screen_required: bool = False
    copy_paste_disabled: bool = True


class AssessmentCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    subject_id: str
    section_ids: List[str]
    assessment_type: AssessmentType
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=300)
    total_marks: int = Field(..., ge=1)
    start_time: Optional[datetime] = None
    end_time: datetime
    mcq_questions: Optional[List[MCQQuestionSchema]] = []
    coding_questions: Optional[List[CodingQuestionSchema]] = []
    manual_questions: Optional[List[ManualQuestionSchema]] = []
    coding_config: Optional[CodingConfigSchema] = None
    rules: RulesSchema = RulesSchema()
    instructions: Optional[str] = None
    release_questions_after_deadline: Optional[bool] = False


class AssessmentResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    subject_id: str
    section_ids: List[str]
    assessment_type: str
    duration_minutes: Optional[int] = None
    total_marks: int
    start_time: Optional[datetime] = None
    end_time: datetime
    teacher_id: str
    status: str
    release_questions_after_deadline: Optional[bool] = False
    created_at: Optional[datetime] = None


class AssessmentDetailResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    subject_id: str
    section_ids: List[str]
    assessment_type: str
    duration_minutes: Optional[int] = None
    total_marks: int
    start_time: Optional[datetime] = None
    end_time: datetime
    teacher_id: str
    mcq_questions: Optional[List[dict]] = []
    coding_questions: Optional[List[dict]] = []
    manual_questions: Optional[List[dict]] = []
    coding_config: Optional[dict] = None
    rules: dict
    instructions: Optional[str] = None
    status: str
    release_questions_after_deadline: Optional[bool] = False
    created_at: Optional[datetime] = None


class StudentAssessmentResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    subject_id: str
    assessment_type: str
    duration_minutes: Optional[int] = None
    total_marks: int
    start_time: Optional[datetime] = None
    end_time: datetime
    status: str
    instructions: Optional[str] = None
    release_questions_after_deadline: Optional[bool] = False
