"""Test fixtures.

Tests run against a disposable MongoDB database (``grademaster_test`` by default,
override with TEST_MONGO_DB_NAME) that is dropped before every test. External
services are never called: the LLM provider is disabled and Judge0 is stubbed.
"""

import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

TEST_DB = os.environ.get("TEST_MONGO_DB_NAME", "grademaster_test")
assert TEST_DB.endswith("_test"), "Refusing to run tests against a non-test database"
os.environ.update({
    "MONGO_DB_NAME": TEST_DB,
    "JWT_SECRET": "test-secret-" + "x" * 40,
    "RATE_LIMIT_ENABLED": "false",
    "LLM_PROVIDER": "none",
    "GEMINI_API_KEY": "",
    "GOOGLE_VISION_API_KEY": "",
    "APP_ENV": "test",
})

import httpx  # noqa: E402
import pytest_asyncio  # noqa: E402

from app import database  # noqa: E402
from app.core.security import create_access_token, hash_password  # noqa: E402
from app.main import app  # noqa: E402


@pytest_asyncio.fixture
async def db():
    database_ = await database.connect_db(TEST_DB)
    await database.client.drop_database(TEST_DB)
    await database.run_migrations(database_)
    yield database_
    await database.client.drop_database(TEST_DB)
    await database.close_db()


@pytest_asyncio.fixture
async def client(db):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def auth(user: dict) -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(user['_id']), user['role'], user.get('token_version', 0))}"}


def now() -> datetime:
    return datetime.now(timezone.utc)


class World:
    """A small institution: 1 admin, 1 department, 2 sections, 1 subject, 2 teachers, 2 students."""

    def __init__(self, db):
        self.db = db

    async def user(self, role, name, email, **extra):
        doc = {"name": name, "email": email, "password": hash_password("Passw0rd!"), "role": role,
               "is_approved": True, "is_active": True, "token_version": 0, "department_id": None,
               "year": None, "section_id": None, "created_at": now(), "updated_at": now()} | extra
        doc["_id"] = (await self.db.users.insert_one(doc)).inserted_id
        return doc

    async def build(self):
        db = self.db
        self.admin = await self.user("admin", "Admin", "admin@test.io")
        dept = {"name": "CSE", "created_at": now()}
        dept["_id"] = (await db.departments.insert_one(dept)).inserted_id
        self.dept_id = str(dept["_id"])
        secs = []
        for name in ("A", "B"):
            s = {"name": name, "year": 2, "department_id": self.dept_id, "created_at": now()}
            s["_id"] = (await db.sections.insert_one(s)).inserted_id
            secs.append(str(s["_id"]))
        self.section_a, self.section_b = secs
        subj = {"name": "Data Structures", "year": 2, "department_id": self.dept_id, "topics": ["Stacks", "Queues"],
                "created_at": now()}
        subj["_id"] = (await db.subjects.insert_one(subj)).inserted_id
        self.subject_id = str(subj["_id"])
        self.teacher = await self.user("faculty", "Teacher One", "t1@test.io", department_id=self.dept_id)
        self.other_teacher = await self.user("faculty", "Teacher Two", "t2@test.io", department_id=self.dept_id)
        await db.teacher_assignments.insert_one({"teacher_id": str(self.teacher["_id"]), "subject_id": self.subject_id,
                                                 "section_ids": [self.section_a], "created_at": now()})
        await db.teacher_assignments.insert_one({"teacher_id": str(self.other_teacher["_id"]), "subject_id": self.subject_id,
                                                 "section_ids": [self.section_b], "created_at": now()})
        self.student = await self.user("student", "Stu Dent", "s1@test.io", year=2, section_id=self.section_a,
                                       department_id=self.dept_id)
        self.student2 = await self.user("student", "Stu Two", "s2@test.io", year=2, section_id=self.section_a,
                                        department_id=self.dept_id)
        self.outsider = await self.user("student", "Out Sider", "s3@test.io", year=2, section_id=self.section_b,
                                        department_id=self.dept_id)
        return self

    async def assessment(self, client, kind="mcq", **overrides):
        body = {
            "title": f"{kind} quiz", "subject_id": self.subject_id, "section_ids": [self.section_a],
            "assessment_type": kind, "duration_minutes": 30,
            "start_time": (now() + timedelta(minutes=5)).isoformat(),
            "end_time": (now() + timedelta(hours=2)).isoformat(),
        }
        if kind in ("mcq", "mixed"):
            body["mcq_questions"] = [
                {"question_id": "q1", "question_text": "LIFO structure?", "options": [
                    {"option_id": "a", "text": "Stack"}, {"option_id": "b", "text": "Queue"}],
                 "correct_option_id": "a", "marks": 2, "topic": "Stacks"},
                {"question_id": "q2", "question_text": "FIFO structure?", "options": [
                    {"option_id": "a", "text": "Stack"}, {"option_id": "b", "text": "Queue"}],
                 "correct_option_id": "b", "marks": 3, "topic": "Queues"},
            ]
        if kind in ("coding", "mixed"):
            body["coding_questions"] = [{
                "question_id": "c1", "title": "Double it", "problem_statement": "Read n, print 2n",
                "test_cases": [{"input": "2", "expected_output": "4"}, {"input": "5", "expected_output": "10"},
                               {"input": "7", "expected_output": "14", "is_hidden": True},
                               {"input": "0", "expected_output": "0", "is_hidden": True}],
                "marks": 10, "topic": "Basics"}]
        if kind == "manual":
            body.pop("duration_minutes")
            body["start_time"] = None
            body["manual_questions"] = [
                {"question_id": "Q1", "question_text": "What is a stack?", "model_answer": "A LIFO data structure with push and pop.",
                 "keywords": ["LIFO", "push", "pop"], "marks": 5, "topic": "Stacks"},
                {"question_id": "Q2", "question_text": "What is a queue?", "model_answer": "A FIFO structure with enqueue and dequeue.",
                 "keywords": ["FIFO|first in first out", "enqueue"], "marks": 5, "topic": "Queues"},
            ]
        body.update(overrides)
        r = await client.post("/api/teacher/assessments", json=body, headers=auth(self.teacher))
        assert r.status_code == 201, r.text
        return r.json()

    async def open_now(self, assessment_id):
        from bson import ObjectId
        await self.db.assessments.update_one({"_id": ObjectId(assessment_id)},
                                             {"$set": {"start_time": now() - timedelta(minutes=1)}})

    async def end_now(self, assessment_id):
        from bson import ObjectId
        await self.db.assessments.update_one({"_id": ObjectId(assessment_id)}, {"$set": {
            "start_time": now() - timedelta(hours=3), "end_time": now() - timedelta(hours=1)}})


@pytest_asyncio.fixture
async def world(db):
    return await World(db).build()


@pytest.fixture
def fake_judge0(monkeypatch):
    """Stub Judge0: the 'program' doubles its integer input unless the code contains BUG/CRASH/DOWN."""
    import app.services.evaluation_service as ev

    async def execute_batch(code, language, stdins, **kwargs):
        if "DOWN" in code:
            return [{"status": {"id": 0, "description": "Execution service unavailable"}, "error": True,
                     "stdout": None, "stderr": "unreachable"} for _ in stdins]
        out = []
        for s in stdins:
            if "CRASH" in code:
                out.append({"status": {"id": 11, "description": "Runtime Error (NZEC)"}, "stdout": "",
                            "stderr": "ZeroDivisionError: division by zero"})
                continue
            value = int(s or 0) * (3 if "BUG" in code and int(s or 0) > 4 else 2)
            out.append({"status": {"id": 3, "description": "Accepted"}, "stdout": f"{value}\n", "time": "0.01", "memory": 3000})
        return out

    monkeypatch.setattr(ev, "execute_batch", execute_batch)
    return execute_batch
