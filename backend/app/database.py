"""MongoDB connection lifecycle and versioned, idempotent migrations."""

import logging
from datetime import datetime, timezone
from typing import Awaitable, Callable, List, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING

from app.core.config import settings

logger = logging.getLogger("grademaster.db")

client: Optional[AsyncIOMotorClient] = None
db: Optional[AsyncIOMotorDatabase] = None


async def connect_db(db_name: Optional[str] = None) -> AsyncIOMotorDatabase:
    global client, db
    client = AsyncIOMotorClient(
        settings.mongo_uri, tz_aware=True, serverSelectionTimeoutMS=8000, appname="grademaster"
    )
    db = client[db_name or settings.mongo_db_name]
    await client.admin.command("ping")
    logger.info("Connected to MongoDB database '%s'", db.name)
    return db


async def close_db() -> None:
    global client, db
    if client:
        client.close()
    client, db = None, None


def get_database() -> AsyncIOMotorDatabase:
    if db is None:
        raise RuntimeError("Database not connected")
    return db


# ─── Migrations ────────────────────────────────────────────────────────────
# Each migration runs once per database and is recorded in `schema_migrations`.
# Migrations must be idempotent and must never destroy data: anything they remove is
# first copied to an archive collection.

ARCHIVE = "submission_duplicates_archive"


async def _archive_duplicates(database, collection: str, keys: List[str]) -> int:
    pipeline = [
        {"$sort": {"submitted_at": ASCENDING, "_id": ASCENDING}},
        {"$group": {"_id": {k: f"${k}" for k in keys}, "ids": {"$push": "$_id"}, "n": {"$sum": 1}}},
        {"$match": {"n": {"$gt": 1}}},
    ]
    moved = 0
    async for group in database[collection].aggregate(pipeline):
        for dup_id in group["ids"][1:]:  # keep the earliest submission
            doc = await database[collection].find_one({"_id": dup_id})
            if not doc:
                continue
            await database[ARCHIVE].insert_one({
                "source_collection": collection,
                "reason": "duplicate submission (kept earliest)",
                "archived_at": datetime.now(timezone.utc),
                "document": doc,
            })
            await database[collection].delete_one({"_id": dup_id})
            moved += 1
    if moved:
        logger.warning("Archived %d duplicate document(s) from %s into %s", moved, collection, ARCHIVE)
    return moved


async def _m001_indexes(database) -> None:
    await _archive_duplicates(database, "mcq_submissions", ["assessment_id", "student_id"])
    await _archive_duplicates(database, "coding_submissions", ["assessment_id", "student_id", "question_id"])
    await _archive_duplicates(database, "manual_submissions", ["assessment_id", "student_id"])

    async for user in database.users.find({"email": {"$regex": "[A-Z]"}}, {"email": 1}):
        await database.users.update_one({"_id": user["_id"]}, {"$set": {"email": user["email"].lower()}})

    await database.users.create_index("email", unique=True, name="uniq_email")
    await database.users.create_index([("role", ASCENDING), ("is_approved", ASCENDING)])
    await database.departments.create_index("name", unique=True)
    await database.sections.create_index(
        [("department_id", ASCENDING), ("year", ASCENDING), ("name", ASCENDING)], unique=True)
    await database.subjects.create_index(
        [("department_id", ASCENDING), ("year", ASCENDING), ("name", ASCENDING)], unique=True)
    await database.teacher_assignments.create_index(
        [("teacher_id", ASCENDING), ("subject_id", ASCENDING)], unique=True)
    await database.assessments.create_index([("teacher_id", ASCENDING), ("created_at", DESCENDING)])
    await database.assessments.create_index([("section_ids", ASCENDING), ("year", ASCENDING)])
    await database.mcq_submissions.create_index(
        [("assessment_id", ASCENDING), ("student_id", ASCENDING)], unique=True)
    await database.mcq_submissions.create_index([("student_id", ASCENDING), ("submitted_at", DESCENDING)])
    await database.coding_submissions.create_index(
        [("assessment_id", ASCENDING), ("student_id", ASCENDING), ("question_id", ASCENDING)], unique=True)
    await database.coding_submissions.create_index([("assessment_id", ASCENDING), ("status", ASCENDING)])
    await database.coding_submissions.create_index([("student_id", ASCENDING), ("submitted_at", DESCENDING)])
    await database.manual_submissions.create_index(
        [("assessment_id", ASCENDING), ("student_id", ASCENDING)], unique=True)
    await database.manual_submissions.create_index([("student_id", ASCENDING), ("submitted_at", DESCENDING)])
    await database.assessment_reports.create_index("assessment_id", unique=True)


async def _m002_user_flags(database) -> None:
    """Explicit is_active / token_version on every user (deactivation + token revocation)."""
    await database.users.update_many({"is_active": {"$exists": False}}, {"$set": {"is_active": True}})
    await database.users.update_many({"token_version": {"$exists": False}}, {"$set": {"token_version": 0}})


async def _m003_support_collections(database) -> None:
    await database.attempts.create_index(
        [("assessment_id", ASCENDING), ("student_id", ASCENDING)], unique=True)
    await database.jobs.create_index([("status", ASCENDING), ("created_at", ASCENDING)])
    await database.jobs.create_index([("kind", ASCENDING), ("ref_id", ASCENDING)])
    await database.audit_log.create_index([("created_at", DESCENDING)])


MIGRATIONS: List[Tuple[str, Callable[..., Awaitable[None]]]] = [
    ("001_indexes_and_dedupe", _m001_indexes),
    ("002_user_flags", _m002_user_flags),
    ("003_support_collections", _m003_support_collections),
]


async def run_migrations(database: Optional[AsyncIOMotorDatabase] = None) -> List[str]:
    database = database if database is not None else get_database()
    applied = {m["_id"] async for m in database.schema_migrations.find({}, {"_id": 1})}
    ran = []
    for migration_id, fn in MIGRATIONS:
        if migration_id in applied:
            continue
        logger.info("Applying migration %s", migration_id)
        await fn(database)
        await database.schema_migrations.insert_one(
            {"_id": migration_id, "applied_at": datetime.now(timezone.utc)})
        ran.append(migration_id)
    return ran
