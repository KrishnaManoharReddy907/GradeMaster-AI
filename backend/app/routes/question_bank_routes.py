from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field

from app.core.deps import load_owned_assessment, require_staff
from app.services import question_bank_service as svc
from app.services.audit_service import record_audit

router = APIRouter()


class BankItemCreate(BaseModel):
    subject_id: str
    type: str = Field(..., pattern="^(mcq|coding|manual)$")
    question: dict
    shared: bool = False


class GenerateRequest(BaseModel):
    subject_id: str
    type: str = Field(..., pattern="^(mcq|manual)$")
    topic: str = Field(..., min_length=2, max_length=120)
    difficulty: str = Field("medium", pattern="^(easy|medium|hard)$")
    count: int = Field(5, ge=1, le=10)
    marks: int = Field(1, ge=1, le=20)
    context: Optional[str] = Field(None, max_length=6000)


class MarkUsed(BaseModel):
    ids: list[str] = Field(default_factory=list, max_length=200)


@router.get("/question-bank")
async def list_bank(subject_id: Optional[str] = None, type: Optional[str] = Query(None, pattern="^(mcq|coding|manual)$"),
                    topic: Optional[str] = None, search: Optional[str] = Query(None, max_length=100),
                    skip: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=100),
                    teacher: dict = Depends(require_staff)):
    return await svc.list_items(teacher, subject_id, type, topic, search, skip, limit)


@router.post("/question-bank", status_code=status.HTTP_201_CREATED)
async def add_bank_item(data: BankItemCreate, teacher: dict = Depends(require_staff)):
    item = await svc.add_item(teacher, data.subject_id, data.type, data.question, data.shared)
    await record_audit(teacher, "question_bank.add", "question", item["id"], {"type": data.type})
    return item


@router.delete("/question-bank/{item_id}")
async def delete_bank_item(item_id: str, teacher: dict = Depends(require_staff)):
    await svc.delete_item(teacher, item_id)
    return {"message": "Question removed from bank"}


@router.post("/question-bank/import/{assessment_id}")
async def import_assessment(assessment_id: str, teacher: dict = Depends(require_staff)):
    assessment = await load_owned_assessment(assessment_id, teacher)
    return await svc.import_from_assessment(teacher, assessment)


@router.post("/question-bank/mark-used")
async def mark_used(data: MarkUsed, teacher: dict = Depends(require_staff)):
    await svc.mark_used(data.ids)
    return {"message": "ok"}


@router.post("/ai/generate-questions")
async def generate(data: GenerateRequest, teacher: dict = Depends(require_staff)):
    drafts = await svc.generate_questions(teacher, data.subject_id, data.type, data.topic, data.difficulty,
                                          data.count, data.marks, data.context)
    await record_audit(teacher, "ai.generate_questions", "subject", data.subject_id,
                       {"type": data.type, "topic": data.topic, "count": len(drafts)})
    return {"drafts": drafts, "note": "AI-generated drafts. Review every question before using it."}
