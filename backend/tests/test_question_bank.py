import app.services.question_bank_service as qb
from tests.conftest import auth

MCQ = {"question_text": "Which structure is LIFO?", "options": [{"option_id": "a", "text": "Stack"},
       {"option_id": "b", "text": "Queue"}], "correct_option_id": "a", "marks": 1, "topic": "Stacks"}


async def test_bank_add_list_dedupe_delete(client, world):
    t = auth(world.teacher)
    r = await client.post("/api/teacher/question-bank", headers=t, json={"subject_id": world.subject_id, "type": "mcq", "question": MCQ})
    assert r.status_code == 201, r.text
    again = await client.post("/api/teacher/question-bank", headers=t, json={"subject_id": world.subject_id, "type": "mcq", "question": MCQ})
    assert again.json()["id"] == r.json()["id"]  # duplicate text is not stored twice
    listing = (await client.get("/api/teacher/question-bank?search=lifo", headers=t)).json()
    assert listing["total"] == 1 and listing["topics"] == ["Stacks"]
    # Private items are invisible to other teachers; they can't delete them either.
    other = auth(world.other_teacher)
    assert (await client.get("/api/teacher/question-bank", headers=other)).json()["total"] == 0
    assert (await client.delete(f"/api/teacher/question-bank/{r.json()['id']}", headers=other)).status_code == 403
    assert (await client.delete(f"/api/teacher/question-bank/{r.json()['id']}", headers=t)).status_code == 200


async def test_bank_rejects_invalid_question(client, world):
    bad = MCQ | {"correct_option_id": "z"}
    r = await client.post("/api/teacher/question-bank", headers=auth(world.teacher),
                          json={"subject_id": world.subject_id, "type": "mcq", "question": bad})
    assert r.status_code == 400


async def test_import_from_assessment(client, world):
    a = await world.assessment(client, "manual")
    r = await client.post(f"/api/teacher/question-bank/import/{a['id']}", headers=auth(world.teacher))
    assert r.json()["added"] == 2


async def test_ai_generation_validates_drafts(client, world, monkeypatch):
    async def fake_json(prompt, schema, **kw):
        return [
            {"question_text": "What does push do?", "options": ["Adds to top", "Removes top", "Peeks", "Clears"],
             "correct_index": 0, "explanation": "push adds an element to the top.", "difficulty": "easy"},
            {"question_text": "Broken", "options": ["Same", "Same"], "correct_index": 0, "explanation": "x"},
            {"question_text": "Out of range", "options": ["a", "b"], "correct_index": 5, "explanation": "x"},
        ]
    monkeypatch.setattr(qb.llm, "is_configured", lambda: True)
    monkeypatch.setattr(qb.llm, "generate_json", fake_json)
    r = await client.post("/api/teacher/ai/generate-questions", headers=auth(world.teacher), json={
        "subject_id": world.subject_id, "type": "mcq", "topic": "Stacks", "count": 3})
    assert r.status_code == 200, r.text
    drafts = r.json()["drafts"]
    assert len(drafts) == 1 and drafts[0]["correct_option_id"] == "a" and drafts[0]["topic"] == "Stacks"


async def test_ai_generation_rubric_marks_sum(client, world, monkeypatch):
    async def fake_json(prompt, schema, **kw):
        return [{"question_text": "Explain queues", "model_answer": "FIFO ...", "keywords": ["FIFO"],
                 "rubric": [{"criterion": "Definition", "share": 2}, {"criterion": "Example", "share": 1}]}]
    monkeypatch.setattr(qb.llm, "is_configured", lambda: True)
    monkeypatch.setattr(qb.llm, "generate_json", fake_json)
    r = await client.post("/api/teacher/ai/generate-questions", headers=auth(world.teacher), json={
        "subject_id": world.subject_id, "type": "manual", "topic": "Queues", "count": 1, "marks": 5})
    rubric = r.json()["drafts"][0]["rubric"]
    assert sum(c["marks"] for c in rubric) == 5


async def test_ai_generation_requires_subject_assignment(client, world, db, monkeypatch):
    monkeypatch.setattr(qb.llm, "is_configured", lambda: True)
    from datetime import datetime, timezone
    other = {"name": "Algorithms", "year": 3, "department_id": world.dept_id, "created_at": datetime.now(timezone.utc)}
    other_id = str((await db.subjects.insert_one(other)).inserted_id)
    r = await client.post("/api/teacher/ai/generate-questions", headers=auth(world.teacher), json={
        "subject_id": other_id, "type": "mcq", "topic": "Graphs"})
    assert r.status_code == 403


async def test_ai_generation_unconfigured_returns_503(client, world):
    r = await client.post("/api/teacher/ai/generate-questions", headers=auth(world.teacher), json={
        "subject_id": world.subject_id, "type": "mcq", "topic": "Stacks"})
    assert r.status_code == 503
