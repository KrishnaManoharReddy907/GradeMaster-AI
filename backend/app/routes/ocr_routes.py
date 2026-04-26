"""
OCR Routes — Phase 1, 2 & 3
Handles handwritten assignment file uploads, OCR text extraction,
text cleaning, answer segmentation, and evaluation.
"""

import os
import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, status

from app.routes.auth_routes import get_current_user
from app.services.ocr_service import extract_text_from_file
from app.services.text_processing_service import process_text
from app.services.manual_evaluation_service import evaluate_all
from app.services.assessment_service import get_assessment_by_id
from app.database import get_database
from bson import ObjectId

router = APIRouter()

# Upload directory
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Max file size: 20MB
MAX_FILE_SIZE = 20 * 1024 * 1024

# Allowed extensions
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "bmp", "tiff", "webp", "pdf"}


async def student_required(current_user: dict = Depends(get_current_user)) -> dict:
    """Ensure only students can upload handwritten files."""
    if current_user.get("role") != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student access required"
        )
    return current_user


def _get_extension(filename: str) -> str:
    """Extract and validate file extension."""
    if "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower()


@router.post("/student/upload-handwritten")
async def upload_handwritten(
    file: UploadFile = File(...),
    current_user: dict = Depends(student_required),
):
    """Upload a handwritten assignment file (image or PDF) and extract text via OCR.
    
    Accepts: JPG, PNG, BMP, TIFF, WEBP, PDF
    Max size: 20MB
    
    Returns:
    {
        "raw_text": "extracted text",
        "pages": [...],
        "total_pages": N,
        "avg_confidence": 0.93,
        "file_info": {
            "original_name": "...",
            "saved_as": "...",
            "size_bytes": N,
            "type": "image/jpeg"
        }
    }
    """
    # Validate extension
    ext = _get_extension(file.filename or "")
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: .{ext}. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    # Read file content
    file_bytes = await file.read()

    # Validate size
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024*1024)}MB"
        )

    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty file uploaded"
        )

    # Generate unique filename and save
    student_id = str(current_user.get("_id", "unknown"))
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    unique_id = uuid.uuid4().hex[:8]
    saved_filename = f"{student_id}_{timestamp}_{unique_id}.{ext}"
    saved_path = os.path.join(UPLOAD_DIR, saved_filename)

    with open(saved_path, "wb") as f:
        f.write(file_bytes)

    print(f"[OCR] File saved: {saved_path} ({len(file_bytes)} bytes)")

    # Run OCR
    try:
        ocr_result = await extract_text_from_file(file_bytes, file.filename or f"file.{ext}")
    except Exception as e:
        print(f"[OCR] Extraction failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OCR processing failed: {str(e)}"
        )

    # Check for OCR errors
    if "error" in ocr_result and not ocr_result.get("raw_text"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=ocr_result["error"]
        )

    return {
        "raw_text": ocr_result.get("raw_text", ""),
        "pages": ocr_result.get("pages", []),
        "total_pages": ocr_result.get("total_pages", 0),
        "avg_confidence": ocr_result.get("avg_confidence", 0.0),
        "file_info": {
            "original_name": file.filename,
            "saved_as": saved_filename,
            "size_bytes": len(file_bytes),
            "type": file.content_type,
        },
    }


@router.post("/student/process-handwritten")
async def process_handwritten(
    data: dict,
    current_user: dict = Depends(student_required),
):
    """Process OCR-extracted text: clean it and segment into question-answer pairs.
    
    Input:
    {
        "raw_text": "Q1) What is AI?\nA) AI is...\nQ2) What is ML?\nA) ML is...",
        "questions": [  // optional — if provided, enables smart question mapping
            {"question_id": "Q1", "question_text": "What is AI?"},
            {"question_id": "Q2", "question_text": "What is ML?"}
        ]
    }
    
    Returns:
    {
        "cleaned_text": "...",
        "answers": [
            {"question": "Q1", "answer": "..."},
            {"question": "Q2", "answer": "..."}
        ],
        "total_questions": 2
    }
    """
    raw_text = data.get("raw_text", "").strip()
    questions = data.get("questions", None)

    if not raw_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="raw_text is required and cannot be empty"
        )

    try:
        result = await process_text(raw_text, questions=questions)
    except Exception as e:
        print(f"[TextProcessing] Processing failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Text processing failed: {str(e)}"
        )

    return result


@router.post("/student/evaluate-handwritten")
async def evaluate_handwritten(
    data: dict,
    current_user: dict = Depends(student_required),
):
    """Evaluate handwritten assignment answers against teacher's model answers.
    
    Input:
    {
        "assessment_id": "...",
        "answers": {
            "Q1": "student answer for Q1",
            "Q2": "student answer for Q2"
        }
    }
    
    Flow:
    1. Fetch assessment and its manual_questions
    2. Run hybrid evaluation (keyword + AI) on each answer
    3. Store results in manual_submissions collection
    4. Return scores and feedback
    """
    assessment_id = data.get("assessment_id", "").strip()
    student_answers = data.get("answers", {})

    if not assessment_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="assessment_id is required"
        )

    if not student_answers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="answers are required"
        )

    # Fetch assessment
    assessment = await get_assessment_by_id(assessment_id)
    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found"
        )

    if assessment.get("assessment_type") != "manual":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This assessment is not a manual (handwritten) type"
        )

    manual_questions = assessment.get("manual_questions", [])
    if not manual_questions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This assessment has no manual questions defined"
        )

    # Check if already submitted
    db = get_database()
    student_id = str(current_user.get("_id", ""))

    existing = await db.manual_submissions.find_one({
        "student_id": student_id,
        "assessment_id": assessment_id,
    })
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already submitted this assignment"
        )

    # Run evaluation
    try:
        eval_result = await evaluate_all(manual_questions, student_answers)
    except Exception as e:
        print(f"[ManualEval] Evaluation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Evaluation failed: {str(e)}"
        )

    # Store submission in DB
    submission = {
        "student_id": student_id,
        "assessment_id": assessment_id,
        "student_answers": student_answers,
        "manual_evaluation": {
            "results": eval_result["results"],
            "total_score": eval_result["total_score"],
            "total_marks": eval_result["total_marks"],
            "percentage": eval_result["percentage"],
        },
        "status": "evaluated",  # AI evaluated, pending teacher review
        "submitted_at": datetime.utcnow(),
        "evaluated_at": datetime.utcnow(),
    }

    result = await db.manual_submissions.insert_one(submission)
    submission_id = str(result.inserted_id)

    print(f"[ManualEval] Submission {submission_id}: {eval_result['total_score']}/{eval_result['total_marks']} ({eval_result['percentage']}%)")

    return {
        "submission_id": submission_id,
        "total_score": eval_result["total_score"],
        "total_marks": eval_result["total_marks"],
        "percentage": eval_result["percentage"],
        "results": eval_result["results"],
    }
