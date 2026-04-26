"""
OCR Service — Phase 1
Extracts text from images (JPG/PNG) and PDFs using Google Vision API.
PDFs are converted to images per-page using PyMuPDF, then each page is OCR'd.
"""

import os
import base64
import httpx
import fitz  # PyMuPDF
from io import BytesIO
from PIL import Image
from dotenv import load_dotenv

load_dotenv()

GOOGLE_VISION_API_KEY = os.getenv("GOOGLE_VISION_API_KEY")
VISION_API_URL = f"https://vision.googleapis.com/v1/images:annotate?key={GOOGLE_VISION_API_KEY}"


async def _ocr_single_image(image_bytes: bytes) -> dict:
    """Send a single image to Google Vision API for text extraction.
    
    Uses DOCUMENT_TEXT_DETECTION for better handwriting recognition
    and paragraph structure preservation.
    """
    encoded = base64.b64encode(image_bytes).decode("utf-8")

    payload = {
        "requests": [
            {
                "image": {"content": encoded},
                "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
            }
        ]
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(VISION_API_URL, json=payload)

    if response.status_code != 200:
        # Parse Google's error message for clearer diagnostics
        try:
            error_body = response.json()
            google_msg = error_body.get("error", {}).get("message", response.text)
        except Exception:
            google_msg = response.text
        print(f"[OCR] Google Vision API error {response.status_code}: {google_msg}")
        return {
            "error": f"Google Vision API error ({response.status_code}): {google_msg}",
            "text": "",
        }

    result = response.json()
    responses = result.get("responses", [])

    if not responses:
        return {"text": "", "error": "No response from Vision API"}

    annotation = responses[0].get("fullTextAnnotation")
    if not annotation:
        # Try simpler textAnnotations fallback
        text_annotations = responses[0].get("textAnnotations", [])
        if text_annotations:
            return {"text": text_annotations[0].get("description", ""), "confidence": None}
        return {"text": "", "error": "No text detected in image"}

    return {
        "text": annotation.get("text", ""),
        "confidence": _avg_confidence(annotation),
    }


def _avg_confidence(annotation: dict) -> float:
    """Calculate average confidence from Vision API fullTextAnnotation."""
    try:
        confidences = []
        for page in annotation.get("pages", []):
            for block in page.get("blocks", []):
                if block.get("confidence"):
                    confidences.append(block["confidence"])
        return round(sum(confidences) / len(confidences), 3) if confidences else 0.0
    except Exception:
        return 0.0


def _convert_pdf_to_images(pdf_bytes: bytes) -> list[bytes]:
    """Convert each page of a PDF to a PNG image using PyMuPDF.
    
    Returns a list of image bytes (one per page).
    """
    images = []
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        # Render at 2x resolution for better OCR accuracy
        pix = page.get_pixmap(dpi=200)
        img_bytes = pix.tobytes("png")
        images.append(img_bytes)

    doc.close()
    return images


def _validate_and_read_image(file_bytes: bytes) -> bytes:
    """Validate that bytes are a valid image and return them.
    
    Converts non-standard formats to PNG for Vision API compatibility.
    """
    try:
        img = Image.open(BytesIO(file_bytes))
        # Convert RGBA, palette, etc. to RGB
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        
        buf = BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()
    except Exception as e:
        raise ValueError(f"Invalid image file: {str(e)}")


async def extract_text_from_file(file_bytes: bytes, filename: str) -> dict:
    """Main entry point: extract text from an uploaded file.
    
    Supports:
    - JPG/PNG images → single OCR call
    - PDF → convert each page to image → OCR all pages → combine text
    
    Returns:
    {
        "raw_text": "combined text from all pages",
        "pages": [
            {"page": 1, "text": "...", "confidence": 0.95},
            ...
        ],
        "total_pages": N,
        "avg_confidence": 0.93
    }
    """
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

    if ext == "pdf":
        return await _extract_from_pdf(file_bytes)
    elif ext in ("jpg", "jpeg", "png", "bmp", "tiff", "webp"):
        return await _extract_from_image(file_bytes)
    else:
        return {"error": f"Unsupported file type: .{ext}. Use JPG, PNG, or PDF."}


async def _extract_from_image(file_bytes: bytes) -> dict:
    """Extract text from a single image file."""
    try:
        processed = _validate_and_read_image(file_bytes)
    except ValueError as e:
        return {"error": str(e)}

    result = await _ocr_single_image(processed)

    if "error" in result and not result.get("text"):
        return {"error": result["error"], "raw_text": ""}

    return {
        "raw_text": result["text"].strip(),
        "pages": [{"page": 1, "text": result["text"].strip(), "confidence": result.get("confidence")}],
        "total_pages": 1,
        "avg_confidence": result.get("confidence", 0.0),
    }


async def _extract_from_pdf(pdf_bytes: bytes) -> dict:
    """Extract text from a PDF by converting each page to an image and OCR'ing."""
    try:
        page_images = _convert_pdf_to_images(pdf_bytes)
    except Exception as e:
        return {"error": f"Failed to process PDF: {str(e)}"}

    if not page_images:
        return {"error": "PDF has no pages"}

    pages = []
    all_text = []
    total_confidence = 0.0
    confidence_count = 0

    for i, img_bytes in enumerate(page_images):
        result = await _ocr_single_image(img_bytes)
        page_text = result.get("text", "").strip()
        conf = result.get("confidence", 0.0)

        pages.append({
            "page": i + 1,
            "text": page_text,
            "confidence": conf,
        })

        if page_text:
            all_text.append(f"--- Page {i + 1} ---\n{page_text}")

        if conf:
            total_confidence += conf
            confidence_count += 1

    combined_text = "\n\n".join(all_text)
    avg_conf = round(total_confidence / confidence_count, 3) if confidence_count > 0 else 0.0

    return {
        "raw_text": combined_text,
        "pages": pages,
        "total_pages": len(page_images),
        "avg_confidence": avg_conf,
    }
