"""Central configuration loaded from environment variables (12-factor).

Every secret lives server-side only. Nothing in this module is ever sent to the
frontend; the public provider status endpoint only reports *whether* a key is
configured, never its value.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- App -----------------------------------------------------------------
    app_name: str = "MotorWorld Studio"
    environment: Literal["development", "test", "production"] = "development"
    debug: bool = False
    log_level: str = "INFO"
    log_json: bool = False
    public_web_url: str = "http://localhost:3000"
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["http://localhost:3000"])

    # --- Security --------------------------------------------------------------
    secret_key: str = "dev-insecure-change-me-dev-insecure-change-me"
    # Fernet key (urlsafe base64, 32 bytes) used to encrypt user-supplied API keys at rest.
    encryption_key: str | None = None
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    password_reset_minutes: int = 30
    cookie_secure: bool = False
    cookie_domain: str | None = None

    # --- Database --------------------------------------------------------------
    database_url: str = "sqlite+aiosqlite:///./data/motorworld.db"
    db_echo: bool = False

    # --- Queue / Redis ---------------------------------------------------------
    redis_url: str = "redis://localhost:6379/0"
    # "arq" -> jobs are executed by separate worker processes through Redis.
    # "inline" -> jobs run as asyncio tasks inside the API process (dev/tests only).
    queue_mode: Literal["arq", "inline"] = "arq"
    queue_generate: str = "mw:generate"
    queue_media: str = "mw:media"
    queue_gpu: str = "mw:gpu"
    job_timeout_seconds: int = 60 * 30
    job_max_attempts: int = 3
    stale_job_minutes: int = 10
    provider_poll_interval: float = 3.0

    # --- Limits ------------------------------------------------------------------
    max_upload_mb: int = 500
    max_image_upload_mb: int = 40
    max_active_jobs_per_user: int = 4
    rate_limit_per_minute: int = 120
    auth_rate_limit_per_minute: int = 10
    daily_generation_limit: int = 300
    user_storage_quota_mb: int = 20_000

    # --- Storage -----------------------------------------------------------------
    storage_backend: Literal["local", "s3"] = "local"
    storage_local_path: Path = Path("./data/storage")
    s3_endpoint_url: str | None = None
    s3_public_endpoint_url: str | None = None
    s3_region: str = "us-east-1"
    s3_bucket: str = "motorworld"
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_presign_seconds: int = 3600
    # When true, providers receive presigned URLs instead of inline data (requires the
    # bucket endpoint to be reachable from the public internet).
    s3_presign_for_providers: bool = False
    tmp_dir: Path = Path("./data/tmp")
    tmp_max_age_hours: int = 6

    # --- Email (password reset) --------------------------------------------------
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "MotorWorld Studio <no-reply@localhost>"
    smtp_starttls: bool = True

    # --- Providers (server-side keys) ------------------------------------------
    replicate_api_token: str | None = None
    fal_key: str | None = None
    hf_token: str | None = None
    bfl_api_key: str | None = None
    elevenlabs_api_key: str | None = None
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-opus-5-5"
    openai_compat_base_url: str | None = None  # e.g. Groq, OpenRouter, Ollama, HF router
    openai_compat_api_key: str | None = None
    openai_compat_model: str | None = None
    comfyui_url: str | None = None  # e.g. http://127.0.0.1:8188
    local_diffusers_enabled: bool = False
    local_diffusers_device: str = "cuda"
    pexels_api_key: str | None = None
    pixabay_api_key: str | None = None
    unsplash_access_key: str | None = None
    # Allow users to bring their own provider keys (stored encrypted).
    allow_user_api_keys: bool = True

    ffmpeg_bin: str = "ffmpeg"
    ffprobe_bin: str = "ffprobe"
    ffmpeg_threads: int = 2

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v):  # noqa: N805
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                import json

                return json.loads(v)
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    def validate_production(self) -> list[str]:
        problems: list[str] = []
        if self.is_production:
            if self.secret_key.startswith("dev-insecure") or len(self.secret_key) < 32:
                problems.append("SECRET_KEY must be a random string of at least 32 characters")
            if not self.encryption_key:
                problems.append("ENCRYPTION_KEY is required in production")
            if not self.cookie_secure:
                problems.append("COOKIE_SECURE should be true in production (HTTPS)")
            if self.queue_mode == "inline":
                problems.append("QUEUE_MODE=inline is not suitable for production; use arq")
        return problems


@lru_cache
def get_settings() -> Settings:
    return Settings()
