from __future__ import annotations

import base64
import logging
from pathlib import Path

import httpx

from .base import ProviderAuthError, ProviderError, ProviderInputError, ProviderModerationError

log = logging.getLogger(__name__)

DEFAULT_TIMEOUT = httpx.Timeout(connect=15.0, read=120.0, write=120.0, pool=15.0)


def client(timeout: httpx.Timeout | float | None = None, **kw) -> httpx.AsyncClient:
    # trust_env=True keeps corporate/agent proxies working (HTTPS_PROXY, SSL_CERT_FILE).
    return httpx.AsyncClient(timeout=timeout or DEFAULT_TIMEOUT, follow_redirects=True, trust_env=True, **kw)


def raise_for_provider(resp: httpx.Response, provider: str) -> None:
    if resp.is_success:
        return
    body = resp.text[:800]
    code = resp.status_code
    msg = f"{provider} respondió {code}: {body}"
    if code in (401, 403):
        raise ProviderAuthError(f"{provider}: API key inválida o sin permisos ({code})")
    if code == 402:
        raise ProviderAuthError(f"{provider}: sin créditos o se requiere método de pago (402)", code="payment_required")
    if code in (400, 404, 422):
        lowered = body.lower()
        if "nsfw" in lowered or "moderat" in lowered or "safety" in lowered:
            raise ProviderModerationError(f"{provider}: contenido bloqueado por moderación")
        raise ProviderInputError(msg)
    if code == 429:
        raise ProviderError(f"{provider}: límite de uso alcanzado (429)", code="rate_limited")
    raise ProviderError(msg)


async def download(url: str, dest: Path, *, headers: dict | None = None, max_bytes: int = 2_000_000_000) -> Path:
    """Stream a provider output to disk."""
    if url.startswith("data:"):
        header, b64 = url.split(",", 1)
        dest.write_bytes(base64.b64decode(b64))
        return dest
    async with client(httpx.Timeout(connect=20, read=300, write=60, pool=20)) as c:
        async with c.stream("GET", url, headers=headers or {}) as r:
            if not r.is_success:
                raise ProviderError(f"No se pudo descargar el resultado ({r.status_code})")
            total = 0
            with dest.open("wb") as fh:
                async for chunk in r.aiter_bytes(1 << 16):
                    total += len(chunk)
                    if total > max_bytes:
                        raise ProviderError("Resultado demasiado grande")
                    fh.write(chunk)
    return dest


def data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode()
