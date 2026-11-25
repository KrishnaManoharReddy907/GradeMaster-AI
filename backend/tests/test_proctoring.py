from datetime import datetime, timedelta, timezone

from bson import ObjectId

from tests.conftest import auth


async def _start(client, world, rules):
    a = await world.assessment(client, "mixed", rules=rules)
    await world.open_now(a["id"])
    r = await client.post(f"/api/student/assessments/{a['id']}/start", headers=auth(world.student))
    assert r.status_code == 200, r.text
    return a, r.json()


async def _event(client, world, aid, kind="tab_hidden"):
    return await client.post(f"/api/student/assessments/{aid}/proctor-event", headers=auth(world.student), json={"type": kind})


async def test_violations_counted_and_attempt_terminated_at_limit(client, world, db):
    a, start = await _start(client, world, {"proctoring_enabled": True, "max_violations": 3})
    assert start["proctoring"] == {"violations": 0, "max_violations": 3, "terminated": False, "terminated_at": None}
    assert (await _event(client, world, a["id"], "fullscreen_exit")).json()["violations"] == 1
    assert (await _event(client, world, a["id"], "reentered")).json()["terminated"] is False
    third = (await _event(client, world, a["id"])).json()
    assert third["violations"] == 3 and third["terminated"] is True
    # Further events do not change anything; resume shows the closed state.
    assert (await _event(client, world, a["id"])).json()["violations"] == 3
    detail = (await client.get(f"/api/student/assessments/{a['id']}", headers=auth(world.student))).json()
    assert detail["attempt"]["proctoring"]["terminated"] is True

    # The automatic submission right after termination is accepted ...
    r = await client.post("/api/student/submit-mcq", headers=auth(world.student),
                          json={"assessment_id": a["id"], "answers": [{"question_id": "q1", "selected_option_id": "a"}]})
    assert r.status_code == 201
    # ... but once the 2-minute grace has passed, nothing more is accepted.
    await db.attempts.update_one({"assessment_id": a["id"]}, {"$set": {"terminated_at": datetime.now(timezone.utc) - timedelta(minutes=5)}})
    r = await client.post("/api/student/submit-coding", headers=auth(world.student), json={
        "assessment_id": a["id"], "question_id": "c1", "code": "print(1)", "language": "python"})
    assert r.status_code == 403

    # Teacher sees the flag and the event timeline.
    rows = (await client.get(f"/api/teacher/submissions/assessment/{a['id']}", headers=auth(world.teacher))).json()["submissions"]
    assert "left_exam" in rows[0]["review_flags"] and rows[0]["proctoring"]["violations"] == 3
    mcq = (await client.get(f"/api/teacher/mcq-submission/{rows[0]['id']}", headers=auth(world.teacher))).json()
    assert [e["type"] for e in mcq["proctoring"]["events"]] == ["fullscreen_exit", "reentered", "tab_hidden"]


async def test_events_rejected_when_not_proctored_or_not_started(client, world):
    a, _ = await _start(client, world, {"proctoring_enabled": False})
    assert (await _event(client, world, a["id"])).status_code == 400
    b = await world.assessment(client, "mcq", rules={"proctoring_enabled": True})
    await world.open_now(b["id"])
    assert (await _event(client, world, b["id"])).status_code == 403          # no attempt yet
    assert (await client.post(f"/api/student/assessments/{b['id']}/proctor-event", headers=auth(world.outsider),
                              json={"type": "tab_hidden"})).status_code == 403  # not eligible
    await client.post(f"/api/student/assessments/{b['id']}/start", headers=auth(world.student))
    assert (await _event(client, world, b["id"], "made_up")).status_code == 400
