"""Handwritten assignment workflow: upload → OCR → map answers → evaluate; teacher file access."""

from datetime import datetime, timezone
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from app.core.config import settings
from app.core.deps import ensure_owns_assessment, load_assessment, require_staff, require_student
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound, PayloadTooLarge
from app.database import get_database
from app.schemas.submission_schema import ManualSubmissionCreate
from app.services.assessment_service import check_student_eligible, check_submission_window, require_assessment
from app.services.manual_evaluation_service import evaluate_all
from app.services.ocr_service import extract_text, sniff_type
from app.services.text_processing_service import process_text
from app.storage import files

router = APIRouter()

CONTENT_TYPES = {"pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg", "bmp": "image/bmp",
                 "tiff": "image/tiff", "webp": "image/webp"}


async def _manual_assessment_for(student: dict, assessment_id: str) -> dict:
    assessment = await require_assessment(assessment_id)
    if assessment.get("assessment_type") != "manual":
        raise BadRequest("This is not a handwritten assessment")
    check_student_eligible(student, assessment)
    await check_submission_window(student, assessment)
    return assessment


@router.post("/student/upload-handwritten")
async def upload_handwritten(
    file: UploadFile = File(...),
    assessment_id: Optional[str] = Form(None),
    student: dict = Depends(require_student),
):
    """Store the answer sheet and return its OCR text. One file per call; PDFs may have several pages."""
    if assessment_id:
        await _manual_assessment_for(student, assessment_id)
    data = await file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise PayloadTooLarge(f"Files may be at most {settings.max_upload_mb} MB")
    if not data:
        raise BadRequest("The uploaded file is empty")
    kind = sniff_type(data)
    if not kind:
        raise BadRequest("Unsupported file. Upload a JPG, PNG, BMP, TIFF, WEBP or PDF.")

    ocr = await extract_text(data)
    file_id = await files.save_file(
        data, (file.filename or f"answer.{kind}")[:120], CONTENT_TYPES[kind],
        {"owner_id": str(student["_id"]), "assessment_id": assessment_id, "kind": "handwritten",
         "pages": ocr["total_pages"], "ocr_confidence": ocr["avg_confidence"]},
    )
    return {
        "upload_id": file_id,
        "raw_text": ocr["raw_text"],
        "pages": [{k: p[k] for k in ("page", "text", "confidence", "engine")} for p in ocr["pages"]],
        "total_pages": ocr["total_pages"],
        "avg_confidence": ocr["avg_confidence"],
        "engines": ocr["engines"],
        "file_info": {"original_name": file.filename, "size_bytes": len(data), "type": CONTENT_TYPES[kind]},
    }


class ProcessRequest(BaseModel):
    raw_text: str = Field(..., min_length=1, max_length=100_000)
    assessment_id: Optional[str] = None


@router.post("/student/process-handwritten")
async def process_handwritten(data: ProcessRequest, student: dict = Depends(require_student)):
    """Map OCR text to the assessment's questions (question list comes from the server, not the client)."""
    questions: List[dict] = []
    if data.assessment_id:
        assessment = await require_assessment(data.assessment_id)
        check_student_eligible(student, assessment)
        questions = [{"question_id": q.get("question_id"), "question_text": q.get("question_text", "")}
                     for q in assessment.get("manual_questions", [])]
    return await process_text(data.raw_text, questions=questions)


@router.post("/student/evaluate-handwritten", status_code=status.HTTP_201_CREATED)
async def evaluate_handwritten(data: ManualSubmissionCreate, student: dict = Depends(require_student)):
    """Submit the (student-reviewed) answers; AI pre-grades them for the teacher's review."""
    assessment = await _manual_assessment_for(student, data.assessment_id)
    questions = assessment.get("manual_questions") or []
    if not questions:
        raise BadRequest("This assessment has no questions")
    db = get_database()
    student_id = str(student["_id"])
    if await db.manual_submissions.find_one({"student_id": student_id, "assessment_id": data.assessment_id}, {"_id": 1}):
        raise Conflict("You have already submitted this assignment")

    answers = {str(k)[:40]: str(v)[:20000] for k, v in data.answers.items()}
    ocr_conf = (data.ocr or {}).get("avg_confidence")
    ocr_conf = float(ocr_conf) if isinstance(ocr_conf, (int, float)) else None
    evaluation = await evaluate_all(questions, answers, ocr_confidence=ocr_conf)

    now = datetime.now(timezone.utc)
    doc = {
        "student_id": student_id,
        "assessment_id": data.assessment_id,
        "student_answers": answers,
        "manual_evaluation": {k: evaluation[k] for k in ("results", "total_score", "total_marks", "percentage")},
        "review_flags": evaluation["flags"],
        "ocr": {"avg_confidence": ocr_conf, "raw_text": str((data.ocr or {}).get("raw_text", ""))[:100_000]},
        "uploads": [],
        "status": "evaluated",
        "submitted_at": now,
        "evaluated_at": now,
    }
    try:
        result = await db.manual_submissions.insert_one(doc)
    except DuplicateKeyError:
        raise Conflict("You have already submitted this assignment")
    submission_id = str(result.inserted_id)
    linked = await files.attach_files(data.upload_ids, student_id, submission_id)
    if linked:
        await db.manual_submissions.update_one({"_id": result.inserted_id}, {"$set": {"uploads": linked}})
    return {"submission_id": submission_id, "status": "evaluated",
            "message": "Submitted. Your teacher will review the evaluation before results are released."}


@router.get("/teacher/uploads/{file_id}")
async def get_upload(file_id: str, teacher: dict = Depends(require_staff)):
    """Stream an original answer sheet to the teacher who owns the assessment."""
    info = await files.get_file_info(file_id)
    meta = info.get("metadata") or {}
    assessment_id = meta.get("assessment_id")
    if not assessment_id and meta.get("submission_id") and ObjectId.is_valid(meta["submission_id"]):
        sub = await get_database().manual_submissions.find_one(
            {"_id": ObjectId(meta["submission_id"])}, {"assessment_id": 1})
        assessment_id = (sub or {}).get("assessment_id")
    if not assessment_id:
        raise NotFound("File not found")
    ensure_owns_assessment(teacher, await load_assessment(assessment_id))
    _, stream = await files.stream_file(file_id)
    return StreamingResponse(stream, media_type=meta.get("content_type", "application/octet-stream"),
                             headers={"Content-Disposition": f'inline; filename="{info.get("filename", "answer")}"',
                                      "Cache-Control": "private, max-age=300"})
