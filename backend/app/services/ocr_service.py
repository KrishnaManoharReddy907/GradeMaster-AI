"""OCR for handwritten answer sheets (images and PDFs).

Pipeline per page: validate → EXIF-rotate → normalise to PNG → Google Vision
DOCUMENT_TEXT_DETECTION. If Vision is not configured, fails, or returns nothing for a
page, Gemini's vision model transcribes that page instead (recorded as ``engine``
for transparency). Pages are processed concurrently with a small bound.
"""

import asyncio
import base64
import logging
from io import BytesIO
from typing import List, Optional, Tuple

import httpx
from PIL import Image, ImageOps

from app.ai import llm
from app.core.config import settings
from app.core.errors import BadRequest, PayloadTooLarge, ServiceUnavailable, Unprocessable

logger = logging.getLogger("grademaster.ocr")

VISION_URL = "https://vision.googleapis.com/v1/images:annotate"
MAX_PIXELS = 40_000_000  # ~40 MP; larger images are downscaled, decompression bombs rejected
Image.MAX_IMAGE_PIXELS = MAX_PIXELS * 2
PAGE_CONCURRENCY = 4

_SIGNATURES = [
    (b"%PDF", "pdf"), (b"\x89PNG\r\n\x1a\n", "png"), (b"\xff\xd8\xff", "jpg"), (b"BM", "bmp"),
    (b"II*\x00", "tiff"), (b"MM\x00*", "tiff"), (b"RIFF", "webp"),
]


def sniff_type(data: bytes) -> Optional[str]:
    for magic, kind in _SIGNATURES:
        if data.startswith(magic):
            if kind == "webp" and data[8:12] != b"WEBP":
                continue
            return kind
    return None


def _prepare_image(data: bytes) -> bytes:
    try:
        img = Image.open(BytesIO(data))
        img = ImageOps.exif_transpose(img)  # phone photos are often stored rotated
    except Image.DecompressionBombError:
        raise PayloadTooLarge("Image resolution is too large")
    except Exception:
        raise BadRequest("The file is not a readable image")
    if img.width * img.height > MAX_PIXELS:
        scale = (MAX_PIXELS / (img.width * img.height)) ** 0.5
        img = img.resize((int(img.width * scale), int(img.height * scale)))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _pdf_pages(data: bytes) -> List[bytes]:
    import fitz  # PyMuPDF

    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception:
        raise BadRequest("The PDF could not be opened")
    try:
        if doc.page_count == 0:
            raise BadRequest("The PDF has no pages")
        if doc.page_count > settings.max_pdf_pages:
            raise PayloadTooLarge(f"PDFs may have at most {settings.max_pdf_pages} pages")
        return [doc.load_page(i).get_pixmap(dpi=200).tobytes("png") for i in range(doc.page_count)]
    finally:
        doc.close()


def _confidence(annotation: dict) -> Optional[float]:
    values = [b["confidence"] for p in annotation.get("pages", []) for b in p.get("blocks", []) if b.get("confidence")]
    return round(sum(values) / len(values), 3) if values else None


async def _vision(image_png: bytes) -> Tuple[str, Optional[float]]:
    payload = {"requests": [{"image": {"content": base64.b64encode(image_png).decode()},
                             "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
                             "imageContext": {"languageHints": ["en"]}}]}
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(VISION_URL, json=payload, headers={"X-Goog-Api-Key": settings.google_vision_api_key})
    if r.status_code != 200:
        raise RuntimeError(f"Vision HTTP {r.status_code}")
    resp = (r.json().get("responses") or [{}])[0]
    if resp.get("error"):
        raise RuntimeError(resp["error"].get("message", "Vision error"))
    annotation = resp.get("fullTextAnnotation")
    if annotation:
        return annotation.get("text", ""), _confidence(annotation)
    texts = resp.get("textAnnotations") or []
    return (texts[0].get("description", "") if texts else ""), None


_TRANSCRIBE_SCHEMA = {"type": "OBJECT", "properties": {
    "text": {"type": "STRING"}, "legibility": {"type": "NUMBER"}}, "required": ["text"]}


async def _gemini_transcribe(image_png: bytes) -> Tuple[str, Optional[float]]:
    data = await llm.generate_json_from_images(
        "Transcribe all handwritten and printed text on this answer sheet exactly as written, preserving "
        "line breaks and question labels (Q1, 1., (a) ...). Do not correct, complete or improve anything; "
        "write [illegible] for words you cannot read. Also rate overall legibility from 0 to 1.",
        [(image_png, "image/png")], _TRANSCRIBE_SCHEMA,
        system="You are a precise transcription engine. Output only what is on the page.",
    )
    legibility = data.get("legibility")
    return str(data.get("text", "")), (float(legibility) if isinstance(legibility, (int, float)) else None)


async def _ocr_page(index: int, image_png: bytes, sem: asyncio.Semaphore) -> dict:
    async with sem:
        text, conf, engine, error = "", None, None, None
        if settings.google_vision_api_key:
            try:
                text, conf = await _vision(image_png)
                engine = "google_vision"
            except Exception as exc:  # noqa: BLE001
                error = str(exc)
                logger.warning("Vision failed on page %d: %s", index + 1, type(exc).__name__)
        if not text.strip() and llm.vision_configured():
            try:
                text, conf = await _gemini_transcribe(image_png)
                engine = "gemini_vision"
                error = None
            except llm.LLMUnavailable as exc:
                error = error or str(exc)
        return {"page": index + 1, "text": text.strip(), "confidence": conf, "engine": engine, "error": error}


async def extract_text(data: bytes) -> dict:
    """Run OCR on an uploaded file. Raises on unusable input or total OCR failure."""
    kind = sniff_type(data)
    if kind is None:
        raise BadRequest("Unsupported file. Upload a JPG, PNG, BMP, TIFF, WEBP or PDF.")
    if not settings.google_vision_api_key and not llm.vision_configured():
        raise ServiceUnavailable("Handwriting recognition is not configured on this server")

    loop = asyncio.get_running_loop()
    if kind == "pdf":
        pages = await loop.run_in_executor(None, _pdf_pages, data)
    else:
        pages = [await loop.run_in_executor(None, _prepare_image, data)]

    sem = asyncio.Semaphore(PAGE_CONCURRENCY)
    results = await asyncio.gather(*[_ocr_page(i, p, sem) for i, p in enumerate(pages)])
    if not any(r["text"] for r in results):
        errors = [r["error"] for r in results if r["error"]]
        if errors:
            raise ServiceUnavailable("Handwriting recognition failed. Please try again in a moment.")
        raise Unprocessable("No text was found in the file. Check the scan is clear and the right way up.")

    confidences = [r["confidence"] for r in results if r["confidence"] is not None]
    raw = "\n\n".join(f"--- Page {r['page']} ---\n{r['text']}" if len(results) > 1 else r["text"]
                      for r in results if r["text"])
    return {
        "kind": kind,
        "raw_text": raw,
        "pages": results,
        "total_pages": len(results),
        "avg_confidence": round(sum(confidences) / len(confidences), 3) if confidences else None,
        "engines": sorted({r["engine"] for r in results if r["engine"]}),
    }
