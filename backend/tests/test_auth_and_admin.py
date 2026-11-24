from datetime import datetime, timedelta, timezone

from jose import jwt

from tests.conftest import auth


async def test_forged_token_with_old_default_secret_is_rejected(client, world):
    token = jwt.encode({"sub": str(world.admin["_id"]), "role": "admin", "tv": 0,
                        "exp": datetime.now(timezone.utc) + timedelta(minutes=5)}, "supersecret", "HS256")
    r = await client.get("/api/admin/pending-users", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


async def test_cannot_self_register_as_staff_or_admin(client, world):
    for role in ("hod", "admin"):
        r = await client.post("/api/auth/signup", json={"name": "X Y", "email": f"{role}@x.io",
                                                        "password": "abc12345", "role": role})
        assert r.status_code == 422, r.text


async def test_student_signup_and_login(client, world):
    r = await client.post("/api/auth/signup", json={
        "name": "New Student", "email": "NEW@Example.com", "password": "abc12345", "role": "student",
        "department_name": "CSE", "year": 2, "section_name": "A"})
    assert r.status_code == 201, r.text
    r = await client.post("/api/auth/login", json={"email": "new@example.com", "password": "abc12345"})
    assert r.status_code == 200
    me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    assert me.json()["email"] == "new@example.com" and me.json()["section_id"] == world.section_a


async def test_duplicate_email_case_insensitive(client, world):
    r = await client.post("/api/auth/signup", json={"name": "Dup", "email": "T1@TEST.IO", "password": "abc12345",
                                                    "role": "faculty"})
    assert r.status_code == 409


async def test_weak_password_rejected(client, world):
    r = await client.post("/api/auth/signup", json={"name": "Weak", "email": "w@x.io", "password": "abcdefgh",
                                                    "role": "faculty"})
    assert r.status_code == 422


async def test_pending_faculty_cannot_log_in_until_approved(client, world):
    await client.post("/api/auth/signup", json={"name": "Pending Prof", "email": "p@x.io", "password": "abc12345",
                                                "role": "faculty"})
    r = await client.post("/api/auth/login", json={"email": "p@x.io", "password": "abc12345"})
    assert r.status_code == 403 and r.json()["code"] == "pending_approval"
    pending = (await client.get("/api/admin/pending-users", headers=auth(world.admin))).json()
    uid = next(u["id"] for u in pending if u["email"] == "p@x.io")
    assert (await client.put(f"/api/admin/approve-user/{uid}", headers=auth(world.admin))).status_code == 200
    r = await client.post("/api/auth/login", json={"email": "p@x.io", "password": "abc12345"})
    assert r.status_code == 200


async def test_reject_pending_user(client, world):
    await client.post("/api/auth/signup", json={"name": "Spam Prof", "email": "spam@x.io", "password": "abc12345",
                                                "role": "faculty"})
    pending = (await client.get("/api/admin/pending-users", headers=auth(world.admin))).json()
    uid = next(u["id"] for u in pending if u["email"] == "spam@x.io")
    assert (await client.put(f"/api/admin/reject-user/{uid}", headers=auth(world.admin))).status_code == 200
    pending = (await client.get("/api/admin/pending-users", headers=auth(world.admin))).json()
    assert all(u["email"] != "spam@x.io" for u in pending)


async def test_deactivation_revokes_existing_tokens(client, world):
    headers = auth(world.student)
    assert (await client.get("/api/auth/me", headers=headers)).status_code == 200
    r = await client.put(f"/api/admin/users/{world.student['_id']}/status", json={"is_active": False},
                         headers=auth(world.admin))
    assert r.status_code == 200
    assert (await client.get("/api/auth/me", headers=headers)).status_code == 401


async def test_change_password_invalidates_old_token(client, world):
    headers = auth(world.student)
    r = await client.post("/api/auth/change-password", headers=headers,
                          json={"current_password": "Passw0rd!", "password": "N3wpassword"})
    assert r.status_code == 200
    assert (await client.get("/api/auth/me", headers=headers)).status_code == 401


async def test_non_admin_cannot_use_admin_endpoints(client, world):
    for user in (world.teacher, world.student):
        r = await client.post("/api/admin/departments", json={"name": "Hack"}, headers=auth(user))
        assert r.status_code == 403


async def test_admin_creates_staff_and_assigns(client, world):
    r = await client.post("/api/admin/staff", headers=auth(world.admin),
                          json={"name": "New Hod", "email": "hod@x.io", "password": "abc12345", "role": "hod"})
    assert r.status_code == 201 and r.json()["approved"] is True
    r = await client.post("/api/admin/assign-teacher", headers=auth(world.admin), json={
        "teacher_id": r.json()["id"], "subject_id": world.subject_id, "section_ids": [world.section_a, world.section_b]})
    assert r.status_code == 201, r.text
    log = (await client.get("/api/admin/audit-log", headers=auth(world.admin))).json()
    assert {"user.create_staff", "assignment.upsert"} <= {i["action"] for i in log["items"]}


async def test_bootstrap_admin_only_once(client, world):
    r = await client.post("/api/auth/bootstrap-admin", json={"name": "Second", "email": "a2@x.io", "password": "abc12345"})
    assert r.status_code == 403


async def test_malformed_ids_return_404_not_500(client, world):
    r = await client.get("/api/teacher/assessments/not-an-id", headers=auth(world.teacher))
    assert r.status_code == 404
