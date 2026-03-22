import os
import httpx
import asyncio

JUDGE0_URL = os.getenv("JUDGE0_API_URL", "https://ce.judge0.com")
JUDGE0_API_KEY = os.getenv("JUDGE0_API_KEY", "")

LANGUAGE_MAP = {
    "python": 71,
    "cpp": 54,
    "java": 62,
    "javascript": 63,
    "c": 50
}


async def execute_code(source_code: str, language: str, stdin: str) -> dict:
    """Execute code using Judge0 CE public API."""

    language_id = LANGUAGE_MAP.get(language)

    if not language_id:
        return {
            "status": {"id": 0, "description": "Unsupported Language"},
            "stdout": None,
            "stderr": f"Language '{language}' is not supported",
            "compile_output": None,
            "error": True
        }

    headers = {
        "Content-Type": "application/json"
    }

    if JUDGE0_API_KEY:
        headers["X-Auth-Token"] = JUDGE0_API_KEY

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:

            submit_response = await client.post(
                f"{JUDGE0_URL}/submissions",
                params={"base64_encoded": "false", "wait": "false"},
                headers=headers,
                json={
                    "source_code": source_code,
                    "language_id": language_id,
                    "stdin": stdin
                }
            )

            if submit_response.status_code not in [200, 201]:
                return {
                    "status": {"id": 0, "description": "Submission Failed"},
                    "stdout": None,
                    "stderr": f"Judge0 API error: {submit_response.status_code} - {submit_response.text}",
                    "compile_output": None,
                    "error": True
                }

            submit_data = submit_response.json()
            token = submit_data.get("token")

            if not token:
                return {
                    "status": {"id": 0, "description": "No Token"},
                    "stdout": None,
                    "stderr": "Failed to get submission token from Judge0",
                    "compile_output": None,
                    "error": True
                }

            max_attempts = 30
            attempt = 0

            while attempt < max_attempts:
                attempt += 1

                result_response = await client.get(
                    f"{JUDGE0_URL}/submissions/{token}",
                    params={"base64_encoded": "false"},
                    headers=headers
                )

                if result_response.status_code != 200:
                    await asyncio.sleep(1)
                    continue

                result = result_response.json()
                status_id = result.get("status", {}).get("id", 0)

                if status_id in [1, 2]:
                    await asyncio.sleep(1)
                    continue

                return result

            return {
                "status": {"id": 0, "description": "Timeout"},
                "stdout": None,
                "stderr": "Execution timed out waiting for Judge0 result",
                "compile_output": None,
                "error": True
            }

    except httpx.ConnectError as e:
        return {
            "status": {"id": 0, "description": "Connection Error"},
            "stdout": None,
            "stderr": f"Failed to connect to Judge0 API: {str(e)}",
            "compile_output": None,
            "error": True
        }

    except httpx.TimeoutException:
        return {
            "status": {"id": 0, "description": "Timeout"},
            "stdout": None,
            "stderr": "Request to Judge0 API timed out",
            "compile_output": None,
            "error": True
        }

    except Exception as e:
        return {
            "status": {"id": 0, "description": "Error"},
            "stdout": None,
            "stderr": str(e),
            "compile_output": None,
            "error": True
        }
