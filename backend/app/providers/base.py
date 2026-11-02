"""Provider adapter contract.

A *model* (catalog entry, e.g. ``flux-schnell``) can be served by several
*routes* (provider + endpoint). Adapters translate a normalised request into
the provider's wire format, submit it, poll it, and return output URLs/bytes.
The generation service downloads outputs into our own storage — provider
URLs expire, so we never hand them to users as the final result.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal


class ProviderError(Exception):
    """Base provider failure. ``retryable`` failures trigger fallback to another route."""

    retryable: bool = True
    code: str = "provider_error"

    def __init__(self, message: str, *, retryable: bool | None = None, code: str | None = None):
        super().__init__(message)
        if retryable is not None:
            self.retryable = retryable
        if code is not None:
            self.code = code


class ProviderNotConfigured(ProviderError):
    retryable = True
    code = "not_configured"


class ProviderAuthError(ProviderError):
    retryable = True  # another provider may work
    code = "auth"


class ProviderInputError(ProviderError):
    retryable = False  # the request itself is invalid
    code = "invalid_input"


class ProviderModerationError(ProviderError):
    retryable = False
    code = "moderated"


class ProviderCancelled(ProviderError):
    retryable = False
    code = "cancelled"


@dataclass
class InputFile:
    """A file passed to a provider. ``url`` is set when a public/presigned URL is usable."""

    role: str  # image | mask | end_image | video | audio | reference
    path: Path
    mime: str
    url: str | None = None


@dataclass
class ProviderRequest:
    task: str
    endpoint: str
    prompt: str = ""
    negative_prompt: str = ""
    params: dict[str, Any] = field(default_factory=dict)
    inputs: list[InputFile] = field(default_factory=list)
    route_options: dict[str, Any] = field(default_factory=dict)

    def input(self, role: str) -> InputFile | None:
        return next((i for i in self.inputs if i.role == role), None)

    def inputs_by_role(self, role: str) -> list[InputFile]:
        return [i for i in self.inputs if i.role == role]


@dataclass
class OutputItem:
    url: str | None = None
    data: bytes | None = None
    path: Path | None = None
    mime: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class JobState:
    status: Literal["queued", "processing", "completed", "failed", "cancelled"]
    progress: float | None = None  # 0..1 only when the provider reports real progress
    message: str = ""
    outputs: list[OutputItem] = field(default_factory=list)
    error: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class Submission:
    job_id: str | None
    meta: dict[str, Any] = field(default_factory=dict)
    # Synchronous providers may return results immediately.
    immediate: JobState | None = None


class ProviderAdapter(ABC):
    id: str
    name: str
    kind: Literal["cloud", "local", "stock", "llm"] = "cloud"
    homepage: str = ""
    docs_url: str = ""
    key_env: str | None = None  # name of the env var holding the server key
    signup_url: str = ""
    free_tier: str = ""
    commercial_note: str = ""

    def __init__(self, credential: str | None):
        self.credential = credential

    @classmethod
    def requires_key(cls) -> bool:
        return cls.key_env is not None

    def is_configured(self) -> bool:
        return (not self.requires_key()) or bool(self.credential)

    async def health(self) -> tuple[bool, str]:
        """Cheap availability check (no generation cost)."""
        return (self.is_configured(), "configurado" if self.is_configured() else "falta API key")

    @abstractmethod
    async def submit(self, req: ProviderRequest) -> Submission: ...

    async def poll(self, job_id: str, meta: dict[str, Any]) -> JobState:  # pragma: no cover - sync providers
        raise ProviderError("este proveedor no admite consulta de estado", retryable=False)

    async def cancel(self, job_id: str, meta: dict[str, Any]) -> bool:
        return False
