"""Append-only audit log of security- and grade-relevant actions."""

import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional

from app.database import get_database

logger = logging.getLogger("grademaster.audit")


async def record_audit(actor: Optional[dict], action: str, target_type: str,
                       target_id: Optional[str] = None, details: Optional[dict[str, Any]] = None) -> None:
    """Never raises: auditing must not break the action being audited."""
    try:
        await get_database().audit_log.insert_one({
            "actor_id": str(actor["_id"]) if actor else None,
            "actor_name": actor.get("name") if actor else None,
            "actor_role": actor.get("role") if actor else None,
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "details": details or {},
            "created_at": datetime.now(timezone.utc),
        })
    except Exception:  # noqa: BLE001
        logger.exception("Failed to write audit entry %s", action)


async def list_audit(limit: int = 100, skip: int = 0, action: Optional[str] = None) -> dict:
    db = get_database()
    query = {"action": {"$regex": f"^{re.escape(action)}"}} if action else {}
    total = await db.audit_log.count_documents(query)
    rows = await db.audit_log.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {
        "total": total,
        "items": [
            {
                "id": str(r["_id"]), "actor_id": r.get("actor_id"), "actor_name": r.get("actor_name"),
                "actor_role": r.get("actor_role"), "action": r["action"], "target_type": r.get("target_type"),
                "target_id": r.get("target_id"), "details": r.get("details", {}), "created_at": r["created_at"],
            }
            for r in rows
        ],
    }
