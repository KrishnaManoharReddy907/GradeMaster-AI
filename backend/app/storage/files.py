"""Uploaded-file storage in MongoDB GridFS.

GridFS keeps handwritten answer sheets next to the data they belong to. It works the
same locally and on MongoDB Atlas, needs no extra cloud account, and survives
redeploys (unlike a container's local disk).
"""

from datetime import datetime, timezone
from typing import AsyncIterator, Optional, Tuple

from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorGridFSBucket

from app.core.errors import NotFound
from app.database import get_database

BUCKET = "uploads"


def _bucket() -> AsyncIOMotorGridFSBucket:
    return AsyncIOMotorGridFSBucket(get_database(), bucket_name=BUCKET)


async def save_file(data: bytes, filename: str, content_type: str, metadata: dict) -> str:
    file_id = await _bucket().upload_from_stream(
        filename, data,
        metadata={**metadata, "content_type": content_type, "uploaded_at": datetime.now(timezone.utc)},
    )
    return str(file_id)


async def get_file_info(file_id: str) -> dict:
    try:
        oid = ObjectId(file_id)
    except (InvalidId, TypeError):
        raise NotFound("File not found")
    info = await get_database()[f"{BUCKET}.files"].find_one({"_id": oid})
    if not info:
        raise NotFound("File not found")
    return info


async def read_file(file_id: str) -> Tuple[dict, bytes]:
    info = await get_file_info(file_id)
    stream = await _bucket().open_download_stream(info["_id"])
    return info, await stream.read()


async def stream_file(file_id: str) -> Tuple[dict, AsyncIterator[bytes]]:
    info = await get_file_info(file_id)
    stream = await _bucket().open_download_stream(info["_id"])

    async def iterator():
        while True:
            chunk = await stream.readchunk()
            if not chunk:
                break
            yield chunk

    return info, iterator()


async def attach_files(file_ids: list, owner_id: str, submission_id: str) -> list:
    """Link uploads to a submission (only files the student uploaded themselves)."""
    db = get_database()
    linked = []
    for fid in file_ids:
        try:
            oid = ObjectId(fid)
        except (InvalidId, TypeError):
            continue
        info = await db[f"{BUCKET}.files"].find_one({"_id": oid, "metadata.owner_id": owner_id})
        if not info:
            continue
        await db[f"{BUCKET}.files"].update_one({"_id": oid}, {"$set": {"metadata.submission_id": submission_id}})
        linked.append({"file_id": fid, "filename": info.get("filename"),
                       "content_type": (info.get("metadata") or {}).get("content_type"),
                       "size": info.get("length"), "pages": (info.get("metadata") or {}).get("pages")})
    return linked


def owner_of(info: dict) -> Optional[str]:
    return (info.get("metadata") or {}).get("owner_id")
