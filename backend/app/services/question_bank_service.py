"""Question bank (reusable questions) and AI-assisted question drafting."""

import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from bson import ObjectId
from pydantic import ValidationError

from app.ai import llm
from app.core.errors import BadRequest, Forbidden, NotFound, ServiceUnavailable
from app.database import get_database
from app.schemas.assessment_schema import CodingQuestionSchema, ManualQuestionSchema, MCQQuestionSchema

SCHEMAS = {"mcq": MCQQuestionSchema, "coding": CodingQuestionSchema, "manual": ManualQuestionSchema}


def _now():
    return datetime.now(timezone.utc)


def validate_question(qtype: str, data: dict) -> dict:
    schema = SCHEMAS.get(qtype)
    if not schema:
        raise BadRequest("Unknown question type")
    payload = {**data, "question_id": data.get("question_id") or "bank"}
    try:
        return schema(**payload).model_dump()
    except ValidationError as exc:
        first = exc.errors()[0]
        raise BadRequest(f"Invalid {qtype} question: {first.get('msg', 'invalid')}".replace("Value error, ", ""))


async def ensure_subject_access(teacher: dict, subject_id: str) -> dict:
    db = get_database()
    subject = await db.subjects.find_one({"_id": ObjectId(subject_id)}) if ObjectId.is_valid(subject_id) else None
    if not subject:
        raise NotFound("Subject not found")
    if teacher.get("role") != "admin" and not await db.teacher_assignments.find_one(
            {"teacher_id": str(teacher["_id"]), "subject_id": subject_id}):
        raise Forbidden("You are not assigned to this subject")
    return subject


def _serialize(item: dict) -> dict:
    return {"id": str(item["_id"]), "owner_id": item["owner_id"], "subject_id": item["subject_id"],
            "type": item["type"], "topic": item.get("topic"), "difficulty": item.get("difficulty"),
            "question": item["question"], "shared": item.get("shared", False), "source": item.get("source", "manual"),
            "usage_count": item.get("usage_count", 0), "created_at": item.get("created_at")}


async def add_item(teacher: dict, subject_id: str, qtype: str, question: dict, shared: bool = False,
                   source: str = "manual") -> dict:
    await ensure_subject_access(teacher, subject_id)
    clean = validate_question(qtype, question)
    clean.pop("question_id", None)
    text = clean.get("question_text") or clean.get("title") or ""
    db = get_database()
    duplicate = await db.question_bank.find_one({"owner_id": str(teacher["_id"]), "subject_id": subject_id,
                                                 "type": qtype, "fingerprint": _fp(text)})
    if duplicate:
        return _serialize(duplicate)
    doc = {"owner_id": str(teacher["_id"]), "subject_id": subject_id, "type": qtype, "topic": clean.get("topic"),
           "difficulty": clean.get("difficulty"), "question": clean, "shared": shared, "source": source,
           "fingerprint": _fp(text), "usage_count": 0, "created_at": _now()}
    doc["_id"] = (await db.question_bank.insert_one(doc)).inserted_id
    return _serialize(doc)


def _fp(text: str) -> str:
    return re.sub(r"\W+", " ", (text or "").lower()).strip()[:300]


async def list_items(teacher: dict, subject_id: Optional[str], qtype: Optional[str], topic: Optional[str],
                     search: Optional[str], skip: int, limit: int) -> dict:
    db = get_database()
    tid = str(teacher["_id"])
    query: dict = {} if teacher.get("role") == "admin" else {"$or": [{"owner_id": tid}, {"shared": True}]}
    if teacher.get("role") != "admin":
        my_subjects = [a["subject_id"] for a in await db.teacher_assignments.find({"teacher_id": tid}).to_list(500)]
        query = {"$and": [query, {"$or": [{"owner_id": tid}, {"subject_id": {"$in": my_subjects}}]}]}
    if subject_id:
        query["subject_id"] = subject_id
    if qtype:
        query["type"] = qtype
    if topic:
        query["topic"] = topic
    if search:
        query["fingerprint"] = {"$regex": re.escape(_fp(search))}
    total = await db.question_bank.count_documents(query)
    rows = await db.question_bank.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    topics = await db.question_bank.distinct("topic", {k: v for k, v in query.items() if k != "topic"})
    return {"total": total, "items": [_serialize(r) for r in rows], "topics": sorted(t for t in topics if t)}


async def delete_item(teacher: dict, item_id: str) -> None:
    db = get_database()
    item = await db.question_bank.find_one({"_id": ObjectId(item_id)}) if ObjectId.is_valid(item_id) else None
    if not item:
        raise NotFound("Question not found")
    if teacher.get("role") != "admin" and item["owner_id"] != str(teacher["_id"]):
        raise Forbidden("You can only delete your own questions")
    await db.question_bank.delete_one({"_id": item["_id"]})


async def import_from_assessment(teacher: dict, assessment: dict) -> dict:
    added = 0
    for qtype, key in (("mcq", "mcq_questions"), ("coding", "coding_questions"), ("manual", "manual_questions")):
        for q in assessment.get(key) or []:
            try:
                await add_item(teacher, assessment["subject_id"], qtype, q, source="assessment")
                added += 1
            except BadRequest:
                continue
    return {"added": added}


async def mark_used(item_ids: List[str]) -> None:
    ids = [ObjectId(i) for i in item_ids if ObjectId.is_valid(i)]
    if ids:
        await get_database().question_bank.update_many({"_id": {"$in": ids}}, {"$inc": {"usage_count": 1}})


# ─── AI drafting ──────────────────────────────────────────────────────────

_MCQ_SCHEMA = {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
    "question_text": {"type": "STRING"},
    "options": {"type": "ARRAY", "items": {"type": "STRING"}},
    "correct_index": {"type": "INTEGER"},
    "explanation": {"type": "STRING"},
    "difficulty": {"type": "STRING", "enum": ["easy", "medium", "hard"]}},
    "required": ["question_text", "options", "correct_index", "explanation"]}}

_MANUAL_SCHEMA = {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
    "question_text": {"type": "STRING"}, "model_answer": {"type": "STRING"},
    "keywords": {"type": "ARRAY", "items": {"type": "STRING"}},
    "rubric": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
        "criterion": {"type": "STRING"}, "description": {"type": "STRING"}, "share": {"type": "NUMBER"}},
        "required": ["criterion", "share"]}}},
    "required": ["question_text", "model_answer", "keywords"]}}


def _distribute(marks: int, shares: List[float]) -> List[float]:
    """Split marks across rubric criteria in half-mark steps, summing exactly to ``marks``."""
    total = sum(s for s in shares if s > 0) or 1
    raw = [max(0.5, round(marks * s / total * 2) / 2) for s in shares]
    raw[-1] = round(marks - sum(raw[:-1]), 1)
    return raw if raw[-1] > 0 else []


async def generate_questions(teacher: dict, subject_id: str, qtype: str, topic: str, difficulty: str,
                             count: int, marks: int, context: Optional[str]) -> List[dict]:
    subject = await ensure_subject_access(teacher, subject_id)
    if not llm.is_configured():
        raise ServiceUnavailable("AI question generation is not configured on this server")
    scope = (f"Subject: {subject['name']} (year {subject.get('year')})\nTopic: {topic}\nDifficulty: {difficulty}\n"
             + (f"Teacher's notes / syllabus excerpt:\n{llm.fence_untrusted(context[:6000], 'notes')}\n" if context else ""))
    system = ("You write accurate, unambiguous university assessment questions. Every fact must be correct; "
              "avoid trick questions, 'all of the above' and negatively worded stems.")
    try:
        if qtype == "mcq":
            data = await llm.generate_json(
                scope + f"\nWrite {count} distinct multiple-choice questions with exactly 4 options each, one correct. "
                        "Distractors must be plausible misconceptions. Give a 1-2 sentence explanation of the answer.",
                _MCQ_SCHEMA, system=system, temperature=0.7, max_tokens=6000)
        else:
            data = await llm.generate_json(
                scope + f"\nWrite {count} distinct descriptive questions worth {marks} marks each. For each give a concise "
                        "model answer, 3-6 key terms students must use (use '|' for accepted synonyms, e.g. 'CPU|processor'), "
                        "and a rubric of 2-4 criteria with a relative share for each.",
                _MANUAL_SCHEMA, system=system, temperature=0.7, max_tokens=8000)
    except llm.LLMUnavailable:
        raise ServiceUnavailable("The AI service is unavailable right now. Please try again.")

    drafts = []
    for item in (data if isinstance(data, list) else [])[:count]:
        try:
            if qtype == "mcq":
                opts = [str(o).strip() for o in item.get("options", [])][:6]
                idx = int(item.get("correct_index", -1))
                if len(opts) < 2 or not 0 <= idx < len(opts) or len(set(opts)) != len(opts):
                    continue
                q = {"question_text": item["question_text"].strip(),
                     "options": [{"option_id": chr(97 + i), "text": t} for i, t in enumerate(opts)],
                     "correct_option_id": chr(97 + idx), "marks": marks, "topic": topic,
                     "difficulty": item.get("difficulty") or difficulty, "explanation": item.get("explanation", "")}
            else:
                rubric_in = [r for r in item.get("rubric", []) if r.get("criterion")][:4]
                shares = _distribute(marks, [float(r.get("share", 1) or 1) for r in rubric_in]) if rubric_in else []
                q = {"question_text": item["question_text"].strip(), "model_answer": item["model_answer"].strip(),
                     "keywords": [str(k) for k in item.get("keywords", [])][:8], "marks": marks, "topic": topic,
                     "rubric": [{"criterion": r["criterion"][:200], "description": str(r.get("description", ""))[:500],
                                 "marks": m} for r, m in zip(rubric_in, shares)] if shares else []}
            clean = validate_question(qtype, q | {"question_id": f"ai-{uuid.uuid4().hex[:6]}"})
            clean.pop("question_id", None)
            drafts.append(clean)
        except (BadRequest, KeyError, ValueError, TypeError, AttributeError):
            continue
    if not drafts:
        raise ServiceUnavailable("The AI did not return usable questions. Try rephrasing the topic.")
    return drafts
