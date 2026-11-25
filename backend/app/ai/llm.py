"""Async LLM gateway.

One place for every model call in the application:

* non-blocking (async clients only; never the synchronous SDK inside a request),
* bounded by a timeout and retried on transient failures,
* structured output via JSON schema when the caller needs data, not prose,
* provider-agnostic: Gemini (default, works in the cloud) or a local Ollama server.

Callers catch :class:`LLMUnavailable` and fall back to deterministic logic, so an AI
outage degrades features instead of breaking them.
"""

import asyncio
import json
import logging
import re
from typing import Any, Iterable, Optional, Sequence, Tuple

import httpx

from app.core.config import settings

logger = logging.getLogger("grademaster.llm")

_TRANSIENT = ("429", "500", "502", "503", "504", "timeout", "temporar", "unavailable",
              "connection", "reset", "getaddrinfo", "resource_exhausted", "overloaded")


class LLMUnavailable(Exception):
    """The model could not produce a usable answer (not configured, outage, bad output)."""


# Most recent failure, shown to admins on the system-health page (secrets redacted).
last_error: dict = {}


def _redact(text: str) -> str:
    text = str(text)
    for secret in (settings.gemini_api_key, settings.google_vision_api_key):
        if secret:
            text = text.replace(secret, "***")
    return re.sub(r"AIza[0-9A-Za-z_\-]{20,}", "***", text)[:400]


def _record_failure(exc: Exception) -> str:
    from datetime import datetime, timezone
    message = _redact(f"{type(exc).__name__}: {exc}")
    last_error.update(message=message, at=datetime.now(timezone.utc).isoformat())
    return message


_gemini_client = None


def _gemini():
    global _gemini_client
    if not settings.gemini_api_key:
        raise LLMUnavailable("GEMINI_API_KEY is not configured")
    if _gemini_client is None:
        from google import genai
        _gemini_client = genai.Client(api_key=settings.gemini_api_key)
    return _gemini_client


def is_configured() -> bool:
    if settings.llm_provider == "gemini":
        return bool(settings.gemini_api_key)
    return settings.llm_provider == "ollama"


def vision_configured() -> bool:
    return bool(settings.gemini_api_key)


def extract_json(text: str) -> Any:
    """Parse JSON from a model response that may be wrapped in prose or code fences."""
    text = (text or "").strip()
    for candidate in (text, re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.S).strip()):
        try:
            return json.loads(candidate)
        except (json.JSONDecodeError, ValueError):
            pass
    for pattern in (r"\{.*\}", r"\[.*\]"):
        m = re.search(pattern, text, re.S)
        if m:
            try:
                return json.loads(m.group())
            except (json.JSONDecodeError, ValueError):
                continue
    raise LLMUnavailable("Model returned output that is not valid JSON")


async def _retry(fn, attempts: int = 3, timeout: float = 60.0):
    last: Optional[Exception] = None
    for i in range(attempts):
        try:
            return await asyncio.wait_for(fn(), timeout=timeout)
        except LLMUnavailable as exc:
            _record_failure(exc)
            raise
        except Exception as exc:  # noqa: BLE001
            last = exc
            msg = f"{type(exc).__name__} {exc}".lower()
            transient = isinstance(exc, asyncio.TimeoutError) or any(k in msg for k in _TRANSIENT)
            if not transient or i == attempts - 1:
                break
            await asyncio.sleep(1.5 * (2 ** i))
    message = _record_failure(last) if last else "unknown error"
    logger.warning("LLM call failed: %s", message)
    raise LLMUnavailable(f"AI service unavailable ({message})")


async def _gemini_generate(contents: Any, *, system: Optional[str], temperature: float,
                           max_tokens: int, json_schema: Optional[dict]) -> str:
    from google.genai import types

    config_kwargs: dict = {"temperature": temperature, "max_output_tokens": max_tokens}
    # Keep "thinking" minimal for speed and cost. Gemini 2.5 uses a token budget; newer models use a level.
    if settings.gemini_model.startswith("gemini-2.5"):
        config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
    else:
        config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW)
    if system:
        config_kwargs["system_instruction"] = system
    if json_schema is not None:
        config_kwargs["response_mime_type"] = "application/json"
        config_kwargs["response_schema"] = json_schema
    try:
        response = await _gemini().aio.models.generate_content(
            model=settings.gemini_model, contents=contents,
            config=types.GenerateContentConfig(**config_kwargs),
        )
    except Exception as exc:  # noqa: BLE001
        # A model that rejects the thinking setting still works without it.
        if "thinking" not in str(exc).lower():
            raise
        config_kwargs.pop("thinking_config", None)
        response = await _gemini().aio.models.generate_content(
            model=settings.gemini_model, contents=contents,
            config=types.GenerateContentConfig(**config_kwargs),
        )
    text = getattr(response, "text", None)
    if not text:
        raise LLMUnavailable("Model returned an empty response")
    return text


async def _ollama_generate(prompt: str, *, system: Optional[str], temperature: float,
                           max_tokens: int, json_mode: bool) -> str:
    messages = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": prompt}]
    body = {"model": settings.ollama_model, "messages": messages, "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens}}
    if json_mode:
        body["format"] = "json"
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(f"{settings.ollama_host.rstrip('/')}/api/chat", json=body)
        r.raise_for_status()
        return r.json()["message"]["content"]


async def probe() -> dict:
    """Make one tiny real call so admins can see whether AI works and, if not, why."""
    if not is_configured():
        return {"status": "not_configured", "detail": "GEMINI_API_KEY is not set on the server"}
    try:
        text = await generate_text("Reply with the single word: ok", max_tokens=256, timeout=40)
        return {"status": "ok", "detail": f"model {settings.gemini_model} replied", "reply": text.strip()[:20]}
    except LLMUnavailable as exc:
        return {"status": "down", "detail": _redact(str(exc))}


async def generate_text(prompt: str, *, system: Optional[str] = None, temperature: float = 0.3,
                        max_tokens: int = 2048, timeout: float = 60.0) -> str:
    if settings.llm_provider == "none":
        raise LLMUnavailable("AI features are disabled")
    if settings.llm_provider == "ollama":
        return await _retry(lambda: _ollama_generate(prompt, system=system, temperature=temperature,
                                                     max_tokens=max_tokens, json_mode=False), timeout=timeout)
    return await _retry(lambda: _gemini_generate(prompt, system=system, temperature=temperature,
                                                 max_tokens=max_tokens, json_schema=None), timeout=timeout)


async def generate_json(prompt: str, schema: dict, *, system: Optional[str] = None,
                        temperature: float = 0.1, max_tokens: int = 4096, timeout: float = 90.0) -> Any:
    """Return parsed JSON that conforms (structurally) to ``schema`` (OpenAPI subset)."""
    if settings.llm_provider == "none":
        raise LLMUnavailable("AI features are disabled")
    if settings.llm_provider == "ollama":
        hint = f"\n\nRespond with JSON only, matching this schema:\n{json.dumps(schema)}"
        text = await _retry(lambda: _ollama_generate(prompt + hint, system=system, temperature=temperature,
                                                     max_tokens=max_tokens, json_mode=True), timeout=timeout)
    else:
        text = await _retry(lambda: _gemini_generate(prompt, system=system, temperature=temperature,
                                                     max_tokens=max_tokens, json_schema=schema), timeout=timeout)
    return extract_json(text)


async def generate_json_from_images(prompt: str, images: Sequence[Tuple[bytes, str]], schema: dict, *,
                                    system: Optional[str] = None, max_tokens: int = 8192,
                                    timeout: float = 120.0) -> Any:
    """Multimodal call (Gemini only): images are (bytes, mime_type) pairs."""
    from google.genai import types

    parts: list = [types.Part.from_bytes(data=data, mime_type=mime) for data, mime in images]
    parts.append(prompt)
    text = await _retry(lambda: _gemini_generate(parts, system=system, temperature=0.0,
                                                 max_tokens=max_tokens, json_schema=schema), timeout=timeout)
    return extract_json(text)


def fence_untrusted(text: str, tag: str = "student_answer") -> str:
    """Wrap untrusted text in tags and neutralise attempts to close the tag early."""
    safe = (text or "").replace(f"</{tag}>", f"</ {tag}>")
    return f"<{tag}>\n{safe}\n</{tag}>"


_INJECTION_PATTERNS = [
    r"ignore (all |any |the )?(previous|above|prior|earlier) (instructions|prompts?|rules)",
    r"disregard (the )?(rubric|instructions|model answer)",
    r"(award|give|assign) (me |this answer )?(full|maximum|max|all) (marks|score|points)",
    r"you are now (a|an|the) (teacher|grader|examiner|evaluator)",
    r"system prompt",
    r"\bscore\s*[:=]\s*\d+",
    r"as an ai (language )?model",
]


def detect_prompt_injection(text: str) -> Optional[str]:
    lowered = (text or "").lower()
    for pattern in _INJECTION_PATTERNS:
        m = re.search(pattern, lowered)
        if m:
            return m.group(0)
    return None


def first_nonempty(values: Iterable[Optional[str]], default: str = "") -> str:
    for v in values:
        if v and str(v).strip():
            return str(v)
    return default
