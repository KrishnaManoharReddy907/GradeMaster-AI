"""Workflow regressions found in owner testing: mixed assessments, keyword lists, AI re-scoring."""

from bson import ObjectId

from app.ai import llm
from app.jobs.worker import run_job_inline
from tests.conftest import auth


async def _rows(client, student):
    return (await client.get("/api/student/all-submissions", headers=auth(student))).json()["submissions"]


async def test_mixed_assessment_is_one_row_with_partial_status_and_completeness(client, world, fake_judge0, db):
    a = await world.assessment(client, "mixed")
    await world.open_now(a["id"])
    await client.post(f"/api/student/assessments/{a['id']}/start", headers=auth(world.student))
    r = await client.post("/api/student/submit-mcq", headers=auth(world.student), json={
        "assessment_id": a["id"], "answers": [{"question_id": "q1", "selected_option_id": "a"}]})
    assert r.status_code == 201
    row = next(x for x in await _rows(client, world.student) if x["assessment_id"] == a["id"])
    assert row["complete"] is False and row["parts_expected"] == 2          # coding part still missing

    r = await client.post("/api/student/submit-coding", headers=auth(world.student), json={
        "assessment_id": a["id"], "question_id": "c1", "code": "n=int(input())\nprint(n*2)\n", "language": "python"})
    job = await db.jobs.find_one({"_id": ObjectId(r.json()["job_id"])})
    await run_job_inline(job)
    sub_id = r.json()["id"]
    assert (await client.post(f"/api/teacher/review/{sub_id}", headers=auth(world.teacher),
                              json={"final_score": 10})).status_code == 200
    assert (await client.post(f"/api/teacher/finalize/{sub_id}", headers=auth(world.teacher))).status_code == 200

    rows = [x for x in await _rows(client, world.student) if x["assessment_id"] == a["id"]]
    assert len(rows) == 1                                                    # one assessment, one row
    row = rows[0]
    assert row["complete"] is True
    # Coding is finalised, MCQ stays hidden until closing: partly graded, not "pending".
    assert row["status"] == "partial" and row["graded_score"] == 10 and row["graded_max"] == 10
    assert "closes" in row["note"]

    await world.end_now(a["id"])
    row = next(x for x in await _rows(client, world.student) if x["assessment_id"] == a["id"])
    assert row["status"] == "graded" and row["score"] == 12 and row["max_score"] == 15


async def test_comma_separated_keywords_are_split(client, world, db):
    a = await world.assessment(client, "manual", manual_questions=[{
        "question_id": "Q1", "question_text": "Define a stack.", "model_answer": "A LIFO structure with push and pop.",
        "keywords": ["Linear data structure, LIFO, Last-In First-Out, push, pop"], "marks": 5}])
    stored = await db.assessments.find_one({"_id": ObjectId(a["id"])})
    assert stored["manual_questions"][0]["keywords"] == ["Linear data structure", "LIFO", "Last-In First-Out", "push", "pop"]

    # Legacy data that still holds one comma-joined keyword is split at grading time too.
    await db.assessments.update_one({"_id": ObjectId(a["id"])}, {"$set": {
        "manual_questions.0.keywords": ["Linear data structure, LIFO, Last-In First-Out, push, pop"]}})
    r = await client.post("/api/student/evaluate-handwritten", headers=auth(world.student), json={
        "assessment_id": a["id"], "answers": {"Q1": "A stack works on LIFO (Last-In, First-Out). Operations: push and pop."}})
    sub = await db.manual_submissions.find_one({"_id": ObjectId(r.json()["submission_id"])})
    q1 = sub["manual_evaluation"]["results"][0]
    assert {"LIFO", "push", "pop"} <= set(q1["keywords_matched"]) and q1["keyword_score"] >= 3


async def test_teacher_can_rescore_after_ai_outage(client, world, db, monkeypatch):
    a = await world.assessment(client, "manual")
    r = await client.post("/api/student/evaluate-handwritten", headers=auth(world.student), json={
        "assessment_id": a["id"], "answers": {"Q1": "A stack is LIFO with push and pop.", "Q2": "FIFO queue with enqueue."}})
    sid = r.json()["submission_id"]
    sub = await db.manual_submissions.find_one({"_id": ObjectId(sid)})
    assert "ai_unavailable" in sub["review_flags"]

    async def fake_ai(question, answer, max_marks):
        return {"score": max_marks, "feedback": "Good", "correctness": "good", "completeness": "complete",
                "missing_points": [], "criteria": [], "confidence": 0.9}
    from app.services import manual_evaluation_service as mes
    monkeypatch.setattr(mes, "ai_evaluate", fake_ai)
    r = await client.post(f"/api/teacher/manual-submission/{sid}/re-evaluate", headers=auth(world.teacher))
    assert r.status_code == 200, r.text
    sub = await db.manual_submissions.find_one({"_id": ObjectId(sid)})
    assert "ai_unavailable" not in sub["review_flags"] and sub["manual_evaluation"]["results"][0]["ai_score"] == 5
    # Other teachers cannot, and finalized work cannot be re-scored.
    assert (await client.post(f"/api/teacher/manual-submission/{sid}/re-evaluate", headers=auth(world.other_teacher))).status_code in (403, 404)
    await client.put(f"/api/teacher/manual-submission/{sid}/review", headers=auth(world.teacher),
                     json={"question_scores": [{"question_id": "Q1", "score": 5}, {"question_id": "Q2", "score": 4}], "finalize": True})
    assert (await client.post(f"/api/teacher/manual-submission/{sid}/re-evaluate", headers=auth(world.teacher))).status_code == 409


async def test_ai_probe_reports_reason(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "gemini_api_key", None)
    assert (await llm.probe())["status"] == "not_configured"


async def test_probe_times_out_quickly_with_clear_message(monkeypatch):
    import asyncio
    from app.core.config import settings
    monkeypatch.setattr(settings, "gemini_api_key", "test-key-not-real")
    monkeypatch.setattr(settings, "llm_provider", "gemini")

    async def hang(*args, **kwargs):
        await asyncio.sleep(60)
    monkeypatch.setattr(llm, "_gemini_generate", hang)
    real_retry = llm._retry
    monkeypatch.setattr(llm, "_retry", lambda fn, attempts=1, timeout=20: real_retry(fn, attempts=attempts, timeout=0.2))
    result = await llm.probe()
    assert result["status"] == "down" and "no reply from the model" in result["detail"]
