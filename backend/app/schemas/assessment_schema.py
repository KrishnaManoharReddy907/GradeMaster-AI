from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class AssessmentType(str, Enum):
    MCQ = "mcq"
    CODING = "coding"
    MIXED = "mixed"
    MANUAL = "manual"


class DifficultyLevel(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


SUPPORTED_LANGUAGES = ["python", "java", "cpp", "c", "javascript"]


def _topic(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = " ".join(value.split())[:60]
    return value or None


class MCQOptionSchema(BaseModel):
    option_id: str = Field(..., min_length=1, max_length=20)
    text: str = Field(..., min_length=1, max_length=1000)


class MCQQuestionSchema(BaseModel):
    question_id: str = Field(..., min_length=1, max_length=40)
    question_text: str = Field(..., min_length=1, max_length=5000)
    options: List[MCQOptionSchema] = Field(..., min_length=2, max_length=8)
    correct_option_id: str
    marks: int = Field(..., ge=1, le=100)
    difficulty: DifficultyLevel = DifficultyLevel.MEDIUM
    topic: Optional[str] = None
    explanation: Optional[str] = Field(None, max_length=2000)

    _t = field_validator("topic")(classmethod(lambda cls, v: _topic(v)))

    @model_validator(mode="after")
    def _answer_key(self):
        ids = [o.option_id for o in self.options]
        if len(set(ids)) != len(ids):
            raise ValueError(f"Question {self.question_id}: option ids must be unique")
        if self.correct_option_id not in ids:
            raise ValueError(f"Question {self.question_id}: correct option must be one of the options")
        return self


class TestCaseSchema(BaseModel):
    input: str = Field("", max_length=20000)
    expected_output: str = Field(..., max_length=20000)
    is_hidden: bool = False


class CodingQuestionSchema(BaseModel):
    question_id: str = Field(..., min_length=1, max_length=40)
    title: str = Field(..., min_length=1, max_length=200)
    problem_statement: str = Field(..., min_length=1, max_length=20000)
    input_format: str = ""
    output_format: str = ""
    constraints: str = ""
    sample_input: str = ""
    sample_output: str = ""
    test_cases: List[TestCaseSchema] = Field(..., min_length=1, max_length=50)
    marks: int = Field(..., ge=1, le=200)
    difficulty: DifficultyLevel = DifficultyLevel.MEDIUM
    time_limit_seconds: float = Field(default=2, gt=0, le=15)
    memory_limit_mb: int = Field(default=256, ge=32, le=512)
    topic: Optional[str] = None

    _t = field_validator("topic")(classmethod(lambda cls, v: _topic(v)))


class RubricCriterion(BaseModel):
    criterion: str = Field(..., min_length=1, max_length=200)
    description: str = Field("", max_length=1000)
    marks: float = Field(..., gt=0, le=100)


class ManualQuestionSchema(BaseModel):
    question_id: str = Field(..., min_length=1, max_length=40)
    question_text: str = Field(..., min_length=1, max_length=5000)
    model_answer: str = Field(..., min_length=1, max_length=20000)
    keywords: List[str] = Field(default_factory=list, max_length=40)
    marks: int = Field(..., ge=1, le=100)
    topic: Optional[str] = None
    rubric: List[RubricCriterion] = Field(default_factory=list, max_length=10)

    _t = field_validator("topic")(classmethod(lambda cls, v: _topic(v)))

    @field_validator("keywords")
    @classmethod
    def _keywords(cls, value: List[str]) -> List[str]:
        out, seen = [], set()
        for k in value:
            k = " ".join(k.split())
            if k and k.lower() not in seen:
                seen.add(k.lower())
                out.append(k)
        return out

    @model_validator(mode="after")
    def _rubric_total(self):
        if self.rubric:
            total = round(sum(c.marks for c in self.rubric), 2)
            if abs(total - self.marks) > 0.01:
                raise ValueError(
                    f"Question {self.question_id}: rubric marks add up to {total} but the question is worth {self.marks}")
        return self


class CodingConfigSchema(BaseModel):
    allowed_languages: List[str] = Field(default_factory=lambda: ["python", "java", "cpp", "c"])
    enable_auto_grading: bool = True
    partial_marking: bool = True

    @field_validator("allowed_languages")
    @classmethod
    def _langs(cls, value: List[str]) -> List[str]:
        bad = [v for v in value if v not in SUPPORTED_LANGUAGES]
        if bad:
            raise ValueError(f"Unsupported languages: {bad}")
        if not value:
            raise ValueError("Select at least one language")
        return list(dict.fromkeys(value))


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
    description: Optional[str] = Field(None, max_length=5000)
    subject_id: str
    section_ids: List[str] = Field(..., min_length=1)
    assessment_type: AssessmentType
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=600)
    total_marks: Optional[int] = None  # ignored: always computed from the questions
    start_time: Optional[datetime] = None
    end_time: datetime
    mcq_questions: List[MCQQuestionSchema] = Field(default_factory=list, max_length=200)
    coding_questions: List[CodingQuestionSchema] = Field(default_factory=list, max_length=20)
    manual_questions: List[ManualQuestionSchema] = Field(default_factory=list, max_length=50)
    coding_config: Optional[CodingConfigSchema] = None
    rules: RulesSchema = Field(default_factory=RulesSchema)
    instructions: Optional[str] = Field(None, max_length=5000)
    release_questions_after_deadline: bool = False

    @model_validator(mode="after")
    def _consistency(self):
        t = self.assessment_type
        if t == AssessmentType.MCQ and not self.mcq_questions:
            raise ValueError("An MCQ assessment needs at least one MCQ question")
        if t == AssessmentType.CODING and not self.coding_questions:
            raise ValueError("A coding assessment needs at least one coding question")
        if t == AssessmentType.MANUAL and not self.manual_questions:
            raise ValueError("A handwritten assessment needs at least one question")
        if t == AssessmentType.MIXED and not (self.mcq_questions or self.coding_questions):
            raise ValueError("A mixed assessment needs MCQ and/or coding questions")
        if t in (AssessmentType.MCQ, AssessmentType.CODING, AssessmentType.MIXED) and not self.duration_minutes:
            raise ValueError("Duration is required for timed assessments")
        ids = ([q.question_id for q in self.mcq_questions] + [q.question_id for q in self.coding_questions]
               + [q.question_id for q in self.manual_questions])
        if len(ids) != len(set(ids)):
            raise ValueError("Question ids must be unique within an assessment")
        return self

    @property
    def computed_total_marks(self) -> int:
        return (sum(q.marks for q in self.mcq_questions) + sum(q.marks for q in self.coding_questions)
                + sum(q.marks for q in self.manual_questions))


class AssessmentResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    subject_id: str
    subject_name: Optional[str] = None
    section_ids: List[str]
    assessment_type: str
    duration_minutes: Optional[int] = None
    total_marks: int
    question_count: int = 0
    start_time: Optional[datetime] = None
    end_time: datetime
    teacher_id: str
    status: str
    release_questions_after_deadline: bool = False
    created_at: Optional[datetime] = None


class AssessmentDetailResponse(AssessmentResponse):
    mcq_questions: List[dict] = []
    coding_questions: List[dict] = []
    manual_questions: List[dict] = []
    coding_config: Optional[dict] = None
    rules: dict = {}
    instructions: Optional[str] = None


class StudentAssessmentResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    subject_id: str
    subject_name: Optional[str] = None
    assessment_type: str
    duration_minutes: Optional[int] = None
    total_marks: int
    question_count: int = 0
    start_time: Optional[datetime] = None
    end_time: datetime
    status: str
    instructions: Optional[str] = None
    release_questions_after_deadline: bool = False
