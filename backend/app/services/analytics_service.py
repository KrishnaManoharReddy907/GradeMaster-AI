"""Analytics built from real graded data.

Everything here derives from two normalised views of the database:

* **assessment rows**: one per (student, assessment): score, max, percentage, date.
* **question rows**: one per (student, question): topic, score, max. These power
  topic mastery and weak-topic analysis.

Grading rules (single source of truth):
* MCQ counts immediately for teachers; for students only once results are released.
* Coding and handwritten work counts only when **finalized** by a teacher, so the
  numbers reflect human-confirmed grades, not provisional AI scores.
* A teacher-awarded 0 is a real score (never replaced by the AI score).
"""

import math
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional

from bson import ObjectId

from app.database import get_database
from app.services.assessment_service import calculate_assessment_status, results_visible

PASS_MARK = 50.0
HALF_LIFE_DAYS = 30.0


def _pct(score: float, total: float) -> float:
    return round(score / total * 100, 2) if total else 0.0


def _final(sub: dict) -> float:
    for key in ("final_score", "teacher_adjusted_score"):
        if sub.get(key) is not None:
            return float(sub[key])
    return float(sub.get("ai_score") or 0)


async def _assessments(query: dict) -> Dict[str, dict]:
    rows = await get_database().assessments.find(query).to_list(5000)
    for a in rows:
        a["status"] = calculate_assessment_status(a["start_time"], a["end_time"])
    return {str(a["_id"]): a for a in rows}


async def _subject_names(assessments: Iterable[dict]) -> Dict[str, str]:
    ids = {a["subject_id"] for a in assessments if ObjectId.is_valid(a.get("subject_id", ""))}
    rows = await get_database().subjects.find({"_id": {"$in": [ObjectId(i) for i in ids]}}, {"name": 1}).to_list(None)
    return {str(r["_id"]): r["name"] for r in rows}


async def collect(assessments: Dict[str, dict], student_id: Optional[str] = None, student_view: bool = False):
    """Return (assessment_rows, question_rows, coding_bugs, missed_keywords)."""
    db = get_database()
    ids = list(assessments)
    base = {"assessment_id": {"$in": ids}}
    if student_id:
        base["student_id"] = student_id
    mcq = await db.mcq_submissions.find(base).to_list(20000)
    coding = await db.coding_submissions.find(base | {"status": "finalized"}, {"code": 0, "code_embedding": 0}).to_list(20000)
    manual = await db.manual_submissions.find(base | {"status": "finalized"}).to_list(20000)
    names = await _subject_names(assessments.values())

    per_assessment: Dict[tuple, dict] = {}
    questions: List[dict] = []
    bugs: Counter = Counter()
    missed: Counter = Counter()

    def acc(a: dict, sid: str, score: float, total: float, when, kind: str):
        key = (sid, str(a["_id"]))
        row = per_assessment.setdefault(key, {
            "student_id": sid, "assessment_id": str(a["_id"]), "title": a["title"],
            "type": a["assessment_type"], "subject": names.get(a["subject_id"], "Unknown"),
            "score": 0.0, "max": 0.0, "date": when, "kinds": set()})
        row["score"] += score
        row["max"] += total
        row["kinds"].add(kind)
        if when and (row["date"] is None or when > row["date"]):
            row["date"] = when

    def topic_of(q: dict, a: dict) -> str:
        return q.get("topic") or names.get(a["subject_id"], "General")

    for s in mcq:
        a = assessments.get(s["assessment_id"])
        if not a or (student_view and not results_visible(a)):
            continue
        acc(a, s["student_id"], float(s.get("score", 0)), float(s.get("total_marks", 0)), s.get("submitted_at"), "mcq")
        qmap = {q["question_id"]: q for q in a.get("mcq_questions", [])}
        for r in s.get("results", []):
            q = qmap.get(r.get("question_id"), {})
            questions.append({"student_id": s["student_id"], "assessment_id": s["assessment_id"],
                              "question_id": r.get("question_id"), "topic": topic_of(q, a), "type": "mcq",
                              "score": float(r.get("marks_obtained", 0)), "max": float(r.get("max_marks", q.get("marks", 1))),
                              "date": s.get("submitted_at")})
    for s in coding:
        a = assessments.get(s["assessment_id"])
        if not a:
            continue
        score, total = _final(s), float(s.get("max_marks") or 0)
        acc(a, s["student_id"], score, total, s.get("submitted_at"), "coding")
        q = next((q for q in a.get("coding_questions", []) if q["question_id"] == s["question_id"]), {})
        questions.append({"student_id": s["student_id"], "assessment_id": s["assessment_id"], "question_id": s["question_id"],
                          "topic": topic_of(q, a), "type": "coding", "score": score, "max": total, "date": s.get("submitted_at")})
        bugs.update((s.get("issues") or {}).get("bugs", []))
    for s in manual:
        a = assessments.get(s["assessment_id"])
        if not a:
            continue
        ev = s.get("manual_evaluation") or {}
        acc(a, s["student_id"], _final(s) if s.get("final_score", s.get("teacher_adjusted_score")) is not None
            else float(ev.get("total_score", 0)), float(ev.get("total_marks", 0)), s.get("submitted_at"), "manual")
        qmap = {q.get("question_id"): q for q in a.get("manual_questions", [])}
        for r in ev.get("results", []):
            q = qmap.get(r.get("question_id"), {})
            questions.append({"student_id": s["student_id"], "assessment_id": s["assessment_id"],
                              "question_id": r.get("question_id"), "topic": topic_of(q, a), "type": "manual",
                              "score": float(r.get("teacher_score", r.get("final_score", 0)) or 0),
                              "max": float(r.get("max_marks", 0)), "date": s.get("submitted_at")})
            missed.update(r.get("keywords_missed", []))

    rows = []
    for row in per_assessment.values():
        row["percentage"] = _pct(row["score"], row["max"])
        row["kinds"] = sorted(row["kinds"])
        row["score"] = round(row["score"], 2)
        rows.append(row)
    rows.sort(key=lambda r: r["date"] or datetime.min.replace(tzinfo=timezone.utc))
    return rows, questions, bugs, missed


def topic_mastery(question_rows: List[dict], now: Optional[datetime] = None) -> List[dict]:
    """Recency-weighted mastery per topic (recent work counts more; half-life 30 days)."""
    now = now or datetime.now(timezone.utc)
    groups: Dict[str, List[dict]] = defaultdict(list)
    for q in question_rows:
        if q["max"] > 0:
            groups[q["topic"]].append(q)
    out = []
    for topic, items in groups.items():
        wsum = ssum = 0.0
        for q in items:
            age = (now - q["date"]).total_seconds() / 86400 if q.get("date") else 0
            w = math.pow(0.5, max(age, 0) / HALF_LIFE_DAYS)
            wsum += w * q["max"]
            ssum += w * q["score"]
        mastery = round(ssum / wsum * 100, 1) if wsum else 0.0
        level = "strong" if mastery >= 80 else "developing" if mastery >= 50 else "needs_work"
        out.append({"topic": topic, "mastery": mastery, "level": level, "items": len(items),
                    "students": len({q["student_id"] for q in items}),
                    "raw_percentage": _pct(sum(q["score"] for q in items), sum(q["max"] for q in items))})
    return sorted(out, key=lambda t: t["mastery"])


def _stats(rows: List[dict]) -> dict:
    if not rows:
        return {"total_submissions": 0, "average_score": 0, "best_score": 0, "pass_rate": 0}
    pcts = [r["percentage"] for r in rows]
    return {"total_submissions": len(rows), "average_score": round(sum(pcts) / len(pcts), 1),
            "best_score": round(max(pcts), 1),
            "pass_rate": round(sum(1 for p in pcts if p >= PASS_MARK) / len(pcts) * 100, 1)}


def _distribution(pcts: List[float]) -> List[dict]:
    buckets = [(0, 40), (40, 50), (50, 60), (60, 70), (70, 80), (80, 90), (90, 101)]
    return [{"range": f"{lo}-{min(hi, 100)}", "count": sum(1 for p in pcts if lo <= p < hi)} for lo, hi in buckets]


def _serialize_row(r: dict) -> dict:
    return {k: r[k] for k in ("assessment_id", "title", "type", "subject", "score", "max", "percentage", "date")}


async def get_student_analytics(student: dict) -> dict:
    sid = str(student["_id"])
    db = get_database()
    submitted_ids = set()
    for coll in ("mcq_submissions", "coding_submissions", "manual_submissions"):
        submitted_ids.update(await db[coll].distinct("assessment_id", {"student_id": sid}))
    clauses = [{"_id": {"$in": [ObjectId(i) for i in submitted_ids if ObjectId.is_valid(i)]}}]
    if student.get("section_id"):
        clauses.append({"section_ids": student["section_id"], "year": student.get("year")})
    assessments = await _assessments({"$or": clauses})
    rows, questions, bugs, missed = await collect(assessments, student_id=sid, student_view=True)
    topics = topic_mastery([q for q in questions if q["student_id"] == sid])

    subjects: Dict[str, List[float]] = defaultdict(list)
    for r in rows:
        subjects[r["subject"]].append(r["percentage"])
    # Class context: average per assessment for the same assessments (released ones only).
    class_rows, _, _, _ = await collect({r["assessment_id"]: assessments[r["assessment_id"]] for r in rows}, student_view=True) \
        if rows else ([], [], [], [])
    class_avg: Dict[str, List[float]] = defaultdict(list)
    for r in class_rows:
        class_avg[r["assessment_id"]].append(r["percentage"])

    pending = sum(1 for a in assessments.values() if a["status"] == "active")
    strengths = [t for t in reversed(topics) if t["level"] == "strong" and t["items"] >= 2][:3]
    focus = [t for t in topics if t["level"] != "strong"][:3]
    return {
        "stats": _stats(rows) | {"active_assessments": pending},
        "history": [_serialize_row(r) | {"class_average": round(sum(class_avg[r["assessment_id"]]) /
                                                               len(class_avg[r["assessment_id"]]), 1)
                                         if class_avg.get(r["assessment_id"]) else None} for r in rows],
        "subjects": sorted([{"subject": s, "average": round(sum(v) / len(v), 1), "assessments": len(v)}
                            for s, v in subjects.items()], key=lambda s: s["subject"]),
        "topics": topics,
        "insights": {
            "strengths": [t["topic"] for t in strengths],
            "focus_areas": [{"topic": t["topic"], "mastery": t["mastery"]} for t in focus],
            "recurring_coding_issues": [{"issue": b, "count": c} for b, c in bugs.most_common(5)],
            "frequently_missed_concepts": [{"concept": k, "count": c} for k, c in missed.most_common(8)],
        },
    }


async def get_teacher_analytics(teacher: dict, assessment_id: Optional[str] = None) -> dict:
    query = {} if teacher.get("role") == "admin" else {"teacher_id": str(teacher["_id"])}
    if assessment_id:
        query["_id"] = ObjectId(assessment_id) if ObjectId.is_valid(assessment_id) else None
    assessments = await _assessments(query)
    rows, questions, bugs, missed = await collect(assessments)
    pcts = [r["percentage"] for r in rows]

    per_assessment = []
    by_a: Dict[str, List[dict]] = defaultdict(list)
    for r in rows:
        by_a[r["assessment_id"]].append(r)
    for aid, a in assessments.items():
        items = by_a.get(aid, [])
        ap = [r["percentage"] for r in items]
        per_assessment.append({"assessment_id": aid, "title": a["title"], "type": a["assessment_type"],
                               "status": a["status"], "submissions": len(items),
                               "average": round(sum(ap) / len(ap), 1) if ap else None,
                               "pass_rate": round(sum(1 for p in ap if p >= PASS_MARK) / len(ap) * 100, 1) if ap else None,
                               "end_time": a["end_time"]})
    per_assessment.sort(key=lambda x: x["end_time"], reverse=True)

    trend: Dict[str, List[float]] = defaultdict(list)
    for r in rows:
        if r["date"]:
            trend[r["date"].date().isoformat()].append(r["percentage"])

    by_student: Dict[str, List[float]] = defaultdict(list)
    for r in rows:
        by_student[r["student_id"]].append(r["percentage"])
    names = {str(u["_id"]): u.get("name") for u in await get_database().users.find(
        {"_id": {"$in": [ObjectId(s) for s in by_student if ObjectId.is_valid(s)]}}, {"name": 1}).to_list(None)}
    students = [{"student_id": s, "name": names.get(s, "Unknown"), "average": round(sum(v) / len(v), 1), "assessments": len(v)}
                for s, v in by_student.items()]
    at_risk = sorted([s for s in students if s["average"] < PASS_MARK], key=lambda s: s["average"])[:10]

    # Question difficulty (empirical): lowest average first.
    q_groups: Dict[tuple, List[dict]] = defaultdict(list)
    for q in questions:
        q_groups[(q["assessment_id"], q["question_id"])].append(q)
    def question_text(aid: str, qid: str) -> str:
        a = assessments[aid]
        for q in (a.get("mcq_questions") or []) + (a.get("manual_questions") or []):
            if q.get("question_id") == qid:
                return q.get("question_text", "")
        for q in a.get("coding_questions") or []:
            if q.get("question_id") == qid:
                return q.get("title", "")
        return qid

    hardest = sorted([{"assessment_id": k[0], "assessment_title": assessments[k[0]]["title"], "question_id": k[1],
                       "question_text": question_text(k[0], k[1]), "topic": v[0]["topic"], "attempts": len(v),
                       "average": _pct(sum(x["score"] for x in v), sum(x["max"] for x in v))}
                      for k, v in q_groups.items() if len(v) >= 2], key=lambda x: x["average"])[:8]

    return {
        "stats": {"total_students": len(by_student), "total_submissions": len(rows),
                  "average_score": round(sum(pcts) / len(pcts), 1) if pcts else 0,
                  "pass_rate": round(sum(1 for p in pcts if p >= PASS_MARK) / len(pcts) * 100, 1) if pcts else 0,
                  "assessments": len(assessments)},
        "per_assessment": per_assessment,
        "distribution": _distribution(pcts),
        "trend": [{"date": d, "submissions": len(v), "average": round(sum(v) / len(v), 1)} for d, v in sorted(trend.items())],
        "topics": topic_mastery(questions),
        "students": sorted(students, key=lambda s: s["name"] or ""),
        "at_risk": at_risk,
        "hardest_questions": hardest,
        "common_coding_issues": [{"issue": b, "count": c} for b, c in bugs.most_common(6)],
        "frequently_missed_concepts": [{"concept": k, "count": c} for k, c in missed.most_common(8)],
    }


async def get_student_profile_for_teacher(teacher: dict, student_id: str) -> dict:
    """A teacher's view of one student across the teacher's own assessments."""
    query = {} if teacher.get("role") == "admin" else {"teacher_id": str(teacher["_id"])}
    assessments = await _assessments(query)
    rows, questions, bugs, missed = await collect(assessments, student_id=student_id)
    student = await get_database().users.find_one({"_id": ObjectId(student_id)}, {"name": 1, "email": 1}) \
        if ObjectId.is_valid(student_id) else None
    return {"student": {"id": student_id, "name": (student or {}).get("name"), "email": (student or {}).get("email")},
            "stats": _stats(rows), "history": [_serialize_row(r) for r in rows],
            "topics": topic_mastery(questions),
            "recurring_coding_issues": [{"issue": b, "count": c} for b, c in bugs.most_common(5)],
            "frequently_missed_concepts": [{"concept": k, "count": c} for k, c in missed.most_common(8)]}
