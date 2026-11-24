"""Application settings.

All configuration is read here, once, from the environment (and ``backend/.env`` for
local development). Every other module imports ``settings`` instead of calling
``os.getenv`` so that configuration can never be read before ``.env`` is loaded.
"""

from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]

# Values that must never be accepted as a JWT signing secret.
_WEAK_SECRETS = {
    "", "secret", "supersecret", "changeme", "change-me",
    "your-super-secret-key-change-in-production",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Runtime
    environment: str = Field(default="development", alias="APP_ENV")
    log_level: str = "INFO"

    # Database
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db_name: str = "grademaster"

    # Auth
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 120

    # HTTP
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    rate_limit_enabled: bool = True

    # AI / external services
    gemini_api_key: Optional[str] = None
    gemini_model: str = "gemini-2.5-flash"
    google_vision_api_key: Optional[str] = None
    judge0_api_url: str = "https://ce.judge0.com"
    judge0_api_key: Optional[str] = None
    judge0_rapidapi_host: Optional[str] = None
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "llama3"
    llm_provider: str = "gemini"  # gemini | ollama | none
    enable_codebert: bool = False

    # Uploads
    max_upload_mb: int = 20
    max_pdf_pages: int = 20

    @field_validator("jwt_secret")
    @classmethod
    def _secret_must_be_strong(cls, value: str) -> str:
        if value.strip().lower() in _WEAK_SECRETS or len(value) < 32:
            raise ValueError(
                "JWT_SECRET is missing or too weak. Set a random value of at least 32 "
                "characters in backend/.env (e.g. python -c \"import secrets; "
                "print(secrets.token_urlsafe(48))\")."
            )
        return value

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
