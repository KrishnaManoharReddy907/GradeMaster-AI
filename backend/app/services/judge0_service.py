"""Judge0 client: sandboxed code execution.

Every test case of a question is sent in one batch request, then polled together, so
evaluation time is roughly one program run instead of N sequential runs. The
question's CPU-time and memory limits are passed through to the sandbox.
"""

import asyncio
import logging
from typing import Dict, List, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger("grademaster.judge0")

LANGUAGE_MAP = {"python": 71, "cpp": 54, "java": 62, "javascript": 63, "c": 50}

# Judge0 status ids
IN_QUEUE, PROCESSING, ACCEPTED, WRONG_ANSWER, TLE, COMPILE_ERROR = 1, 2, 3, 4, 5, 6
FIELDS = "token,stdout,stderr,compile_output,message,time,memory,status"


def _headers() -> Dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if settings.judge0_api_key:
        if settings.judge0_rapidapi_host:
            headers["X-RapidAPI-Key"] = settings.judge0_api_key
            headers["X-RapidAPI-Host"] = settings.judge0_rapidapi_host
        else:
            headers["X-Auth-Token"] = settings.judge0_api_key
    return headers


def normalize_output(text: Optional[str]) -> str:
    """Compare outputs fairly: unify newlines, ignore trailing spaces and trailing blank lines."""
    if not text:
        return ""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    lines = [line.rstrip() for line in lines]
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines)


def outputs_match(actual: Optional[str], expected: Optional[str]) -> bool:
    return normalize_output(actual) == normalize_output(expected)


def _error_result(description: str, message: str) -> dict:
    return {"status": {"id": 0, "description": description}, "stdout": None,
            "stderr": message, "compile_output": None, "time": None, "memory": None, "error": True}


async def execute_batch(source_code: str, language: str, stdins: List[str],
                        cpu_time_limit: float = 2.0, memory_limit_mb: int = 256,
                        max_wait_seconds: float = 60.0) -> List[dict]:
    """Run ``source_code`` once per stdin; returns Judge0 results in the same order."""
    language_id = LANGUAGE_MAP.get(language)
    if not language_id:
        return [_error_result("Unsupported Language", f"Language '{language}' is not supported")] * len(stdins)
    if not stdins:
        return []

    base = settings.judge0_api_url.rstrip("/")
    payload = {"submissions": [{
        "source_code": source_code, "language_id": language_id, "stdin": stdin,
        "cpu_time_limit": cpu_time_limit, "wall_time_limit": max(cpu_time_limit * 3, 5),
        "memory_limit": int(memory_limit_mb * 1024),
    } for stdin in stdins]}

    try:
        async with httpx.AsyncClient(timeout=30.0, headers=_headers()) as client:
            r = await client.post(f"{base}/submissions/batch", params={"base64_encoded": "false"}, json=payload)
            if r.status_code not in (200, 201):
                logger.warning("Judge0 batch submit failed: %s", r.status_code)
                return [_error_result("Execution service error", f"Judge0 returned HTTP {r.status_code}")] * len(stdins)
            tokens = [t.get("token") for t in r.json()]
            if not all(tokens):
                return [_error_result("Execution service error", "Judge0 did not accept every test case")] * len(stdins)

            results: Dict[str, dict] = {}
            delay, waited = 0.5, 0.0
            while waited < max_wait_seconds:
                pending = [t for t in tokens if t not in results]
                rr = await client.get(f"{base}/submissions/batch",
                                      params={"tokens": ",".join(pending), "base64_encoded": "false", "fields": FIELDS})
                if rr.status_code == 200:
                    for sub in rr.json().get("submissions", []):
                        if sub and sub.get("status", {}).get("id") not in (IN_QUEUE, PROCESSING):
                            results[sub["token"]] = sub
                if len(results) == len(tokens):
                    break
                await asyncio.sleep(delay)
                waited += delay
                delay = min(delay * 1.5, 3.0)
            return [results.get(t) or _error_result("Timeout", "Timed out waiting for the execution service")
                    for t in tokens]
    except httpx.HTTPError as exc:
        logger.warning("Judge0 unreachable: %s", type(exc).__name__)
        return [_error_result("Execution service unavailable", "Could not reach the code execution service")] * len(stdins)


async def execute_code(source_code: str, language: str, stdin: str = "") -> dict:
    """Single run (kept for callers that execute one input)."""
    return (await execute_batch(source_code, language, [stdin]))[0]
