from tests.conftest import auth


async def test_total_marks_computed_server_side(client, world):
    a = await world.assessment(client, "mcq", total_marks=999)
    assert a["total_marks"] == 5 and a["question_count"] == 2


async def test_teacher_cannot_create_for_unassigned_section(client, world):
    r = await client.post("/api/teacher/assessments", headers=auth(world.teacher), json={
        "title": "x", "subject_id": world.subject_id, "section_ids": [world.section_b], "assessment_type": "manual",
        "end_time": "2099-01-01T00:00:00Z",
        "manual_questions": [{"question_id": "Q1", "question_text": "q", "model_answer": "a", "marks": 1}]})
    assert r.status_code == 403


async def test_mcq_answer_key_must_reference_an_option(client, world):
    r = await client.post("/api/teacher/assessments", headers=auth(world.teacher), json={
        "title": "x", "subject_id": world.subject_id, "section_ids": [world.section_a], "assessment_type": "mcq",
        "duration_minutes": 10, "start_time": "2099-01-01T00:00:00Z", "end_time": "2099-01-02T00:00:00Z",
        "mcq_questions": [{"question_id": "q1", "question_text": "?", "options": [{"option_id": "a", "text": "1"},
                           {"option_id": "b", "text": "2"}], "correct_option_id": "z", "marks": 1}]})
    assert r.status_code == 422


async def test_other_teacher_cannot_view_assessment(client, world):
    a = await world.assessment(client, "mcq")
    r = await client.get(f"/api/teacher/assessments/{a['id']}", headers=auth(world.other_teacher))
    assert r.status_code == 403
    r = await client.get(f"/api/teacher/submissions/assessment/{a['id']}", headers=auth(world.other_teacher))
    assert r.status_code == 403


async def test_teacher_detail_includes_manual_questions(client, world):
    a = await world.assessment(client, "manual")
    d = (await client.get(f"/api/teacher/assessments/{a['id']}", headers=auth(world.teacher))).json()
    assert len(d["manual_questions"]) == 2 and d["manual_questions"][0]["model_answer"]


async def test_students_cannot_see_questions_before_start(client, world):
    a = await world.assessment(client, "mcq")
    r = await client.get(f"/api/student/assessments/{a['id']}", headers=auth(world.student))
    assert r.status_code == 403
    await world.open_now(a["id"])
    r = await client.get(f"/api/student/assessments/{a['id']}", headers=auth(world.student))
    assert r.status_code == 200
    assert all("correct_option_id" not in q for q in r.json()["mcq_questions"])


async def test_ineligible_student_blocked(client, world):
    a = await world.assessment(client, "mcq")
    await world.open_now(a["id"])
    r = await client.get(f"/api/student/assessments/{a['id']}", headers=auth(world.outsider))
    assert r.status_code == 403


async def test_mcq_submit_scores_hides_results_until_end_and_blocks_duplicates(client, world):
    a = await world.assessment(client, "mcq")
    await world.open_now(a["id"])
    body = {"assessment_id": a["id"], "answers": [{"question_id": "q1", "selected_option_id": "a"}]}
    r = await client.post("/api/student/submit-mcq", json=body, headers=auth(world.student))
    assert r.status_code == 201, r.text
    assert r.json()["results_visible"] is False

    assert (await client.post("/api/student/submit-mcq", json=body, headers=auth(world.student))).status_code == 409

    status = (await client.get(f"/api/student/submission-status/{a['id']}", headers=auth(world.student))).json()
    assert status["mcq_submitted"] and status["mcq_score"] is None and status["mcq_questions"] == []

    await world.end_now(a["id"])
    status = (await client.get(f"/api/student/submission-status/{a['id']}", headers=auth(world.student))).json()
    assert status["mcq_score"] == 2 and status["mcq_total"] == 5
    q2 = next(r for r in status["mcq_results"] if r["question_id"] == "q2")
    assert q2["answered"] is False and q2["marks_obtained"] == 0


async def test_mcq_results_immediate_when_teacher_allows(client, world):
    a = await world.assessment(client, "mcq", rules={"show_result_immediately": True})
    await world.open_now(a["id"])
    r = await client.post("/api/student/submit-mcq", headers=auth(world.student), json={
        "assessment_id": a["id"], "answers": [{"question_id": "q1", "selected_option_id": "a"},
                                              {"question_id": "q2", "selected_option_id": "b"}]})
    assert r.json()["results_visible"] is True and r.json()["percentage"] == 100


async def test_cannot_submit_after_deadline(client, world):
    a = await world.assessment(client, "mcq")
    await world.end_now(a["id"])
    r = await client.post("/api/student/submit-mcq", headers=auth(world.student),
                          json={"assessment_id": a["id"], "answers": []})
    assert r.status_code == 403


async def test_attempt_records_personal_deadline(client, world):
    a = await world.assessment(client, "mcq")
    await world.open_now(a["id"])
    r1 = (await client.post(f"/api/student/assessments/{a['id']}/start", headers=auth(world.student))).json()
    r2 = (await client.post(f"/api/student/assessments/{a['id']}/start", headers=auth(world.student))).json()
    assert r1["deadline"] == r2["deadline"]  # idempotent


async def test_released_paper_only_after_end(client, world):
    a = await world.assessment(client, "mcq", release_questions_after_deadline=True)
    await world.open_now(a["id"])
    assert (await client.get(f"/api/student/assessments/{a['id']}/review-questions",
                             headers=auth(world.student))).status_code == 403
    await world.end_now(a["id"])
    r = await client.get(f"/api/student/assessments/{a['id']}/review-questions", headers=auth(world.student))
    assert r.status_code == 200 and r.json()["mcq_questions"][0]["correct_option_id"] == "a"


async def test_delete_only_before_start(client, world):
    a = await world.assessment(client, "mcq")
    assert (await client.delete(f"/api/teacher/assessments/{a['id']}", headers=auth(world.other_teacher))).status_code == 403
    assert (await client.delete(f"/api/teacher/assessments/{a['id']}", headers=auth(world.teacher))).status_code == 200


async def test_resume_returns_server_time_and_shuffled_order_is_stable(client, world):
    a = await world.assessment(client, "mcq", rules={"shuffle_questions": True, "shuffle_options": True})
    await world.open_now(a["id"])
    assert (await client.post(f"/api/student/assessments/{a['id']}/start", headers=auth(world.student))).status_code == 200
    first = (await client.get(f"/api/student/assessments/{a['id']}", headers=auth(world.student))).json()
    again = (await client.get(f"/api/student/assessments/{a['id']}", headers=auth(world.student))).json()
    assert first["attempt"]["server_time"] and first["attempt"]["deadline"]
    assert first["mcq_questions"] == again["mcq_questions"]
    assert {q["question_id"] for q in first["mcq_questions"]} == {"q1", "q2"}
