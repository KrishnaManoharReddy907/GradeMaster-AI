"""OCR text clean-up and answer segmentation.

Principle: **transcribe, don't improve.** The model may fix obvious OCR character
errors and restore reading order, but must not add, complete or polish content.
Otherwise a weak answer could come out better than the student wrote it. The raw
OCR text is always returned alongside, and the student reviews and edits the mapped
answers before submitting.
"""

import logging
import re
from typing import List, Optional

from app.ai import llm

logger = logging.getLogger("grademaster.text")

_PAGE_MARK = re.compile(r"-{3}\s*Page\s*\d+\s*-{3}\n*")
_Q_MARK = re.compile(r"(?im)^\s*(?:\(?\s*q(?:uestion)?\s*\.?\s*(\d{1,2})\s*\)?|(\d{1,2})\s*[).:\]])\s*[:.)\-]?\s*")


def basic_cleanup(text: str) -> str:
    text = _PAGE_MARK.sub("", text or "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)  # re-join hyphenated line breaks
    text = re.sub(r"\n{3,}", "\n\n", text)
    return "\n".join(line.strip() for line in text.split("\n")).strip()


def regex_segment(text: str, valid_numbers: Optional[set] = None) -> List[dict]:
    """Split on question markers at line starts (Q1, Q.2, 3), 4:)."""
    matches = [m for m in _Q_MARK.finditer(text)
               if valid_numbers is None or (m.group(1) or m.group(2)) in valid_numbers]
    answers: dict = {}
    for i, m in enumerate(matches):
        num = m.group(1) or m.group(2)
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[m.end():end].strip()
        body = re.sub(r"^(?:ans(?:wer)?|a)\s*[:.)\-]\s*", "", body, flags=re.I)
        if body:
            key = f"Q{num}"
            answers[key] = (answers.get(key, "") + "\n" + body).strip()
    return [{"question": k, "answer": v} for k, v in answers.items()]


_MAP_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "answers": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "question_id": {"type": "STRING"}, "answer": {"type": "STRING"},
            "confidence": {"type": "NUMBER"}}, "required": ["question_id", "answer"]}},
        "unassigned_text": {"type": "STRING"},
    },
    "required": ["answers"],
}


def _words(text: str) -> int:
    return len(re.findall(r"\w+", text or ""))


async def process_text(raw_text: str, questions: Optional[List[dict]] = None) -> dict:
    cleaned = basic_cleanup(raw_text)
    questions = questions or []
    ids = [str(q.get("question_id")) for q in questions if q.get("question_id")]

    if questions and llm.is_configured():
        qlist = "\n".join(f"{q.get('question_id')}: {str(q.get('question_text', ''))[:500]}" for q in questions)
        prompt = f"""The text below was produced by OCR from a student's handwritten answer sheet. OCR may have
misread characters and scrambled the reading order of blocks.

Questions on the paper:
{qlist}

{llm.fence_untrusted(cleaned[:30000], 'ocr_text')}

Assign the student's writing to the questions above.
Rules:
- Use only words that appear in the OCR text. Never add, complete, summarise or improve content.
- You may fix obvious OCR character errors (e.g. 'leaming' -> 'learning') and restore the natural reading order.
- Keep the student's own grammar and mistakes.
- Drop the question labels and repeated question text; keep only the answers.
- Use exactly these question_id values: {', '.join(ids)}. Give an empty answer for unanswered questions.
- Put text you cannot place in unassigned_text.
- confidence: 0-1, how sure you are the answer belongs to that question."""
        try:
            data = await llm.generate_json(prompt, _MAP_SCHEMA, temperature=0.0, max_tokens=12000, timeout=120)
            answers = [{"question": str(a.get("question_id")), "answer": str(a.get("answer", "")).strip(),
                        "confidence": a.get("confidence")} for a in data.get("answers", []) if a.get("question_id") in ids]
            mapped_words = sum(_words(a["answer"]) for a in answers) + _words(data.get("unassigned_text", ""))
            # Guard against silent loss or invention of content.
            ratio = mapped_words / max(1, _words(cleaned))
            if answers and 0.5 <= ratio <= 1.5:
                return {"cleaned_text": cleaned, "answers": answers, "unassigned_text": data.get("unassigned_text", ""),
                        "total_questions": len(answers), "method": "ai_mapping",
                        "warnings": [] if ratio >= 0.8 else ["Some text could not be matched to a question; please check."]}
            logger.info("AI mapping rejected by length guard (ratio %.2f)", ratio)
        except llm.LLMUnavailable as exc:
            logger.info("AI mapping unavailable: %s", exc)

    valid = {re.sub(r"\D", "", i) for i in ids} if ids else None
    answers = regex_segment(cleaned, valid)
    warnings = []
    if not answers and cleaned:
        target = ids[0] if len(ids) == 1 else "Q1"
        answers = [{"question": target, "answer": cleaned}]
        if len(ids) > 1:
            warnings.append("Question labels were not found. All text was placed under the first question; "
                            "please split it before submitting.")
    return {"cleaned_text": cleaned, "answers": answers, "unassigned_text": "", "total_questions": len(answers),
            "method": "pattern", "warnings": warnings}
