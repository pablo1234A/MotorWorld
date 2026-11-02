"""Provider registry, credential resolution and route selection with fallback."""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models import ProviderCredential
from ..security import decrypt_secret
from .base import ProviderAdapter
from .bfl import BFLAdapter
from .catalog import MODELS, ModelSpec, Route
from .comfyui import ComfyUIAdapter
from .diffusers_local import DiffusersAdapter
from .elevenlabs import ElevenLabsAdapter
from .fal import FalAdapter
from .huggingface import HuggingFaceAdapter
from .local import LocalAdapter
from .replicate import ReplicateAdapter

ADAPTERS: dict[str, type[ProviderAdapter]] = {
    a.id: a for a in (LocalAdapter, ComfyUIAdapter, DiffusersAdapter, HuggingFaceAdapter, ReplicateAdapter, FalAdapter, BFLAdapter, ElevenLabsAdapter)
}

# Providers that accept user-supplied (BYOK) keys.
BYOK_PROVIDERS = ["replicate", "fal", "huggingface", "bfl", "elevenlabs", "anthropic", "openai_compat", "pexels", "pixabay", "unsplash"]

SERVER_KEYS = {
    "replicate": "replicate_api_token",
    "fal": "fal_key",
    "huggingface": "hf_token",
    "bfl": "bfl_api_key",
    "elevenlabs": "elevenlabs_api_key",
    "anthropic": "anthropic_api_key",
    "openai_compat": "openai_compat_api_key",
    "pexels": "pexels_api_key",
    "pixabay": "pixabay_api_key",
    "unsplash": "unsplash_access_key",
}

# Test hook: extra adapters registered by the test-suite (never in production code paths).
EXTRA_ADAPTERS: dict[str, type[ProviderAdapter]] = {}


async def user_credentials(db: AsyncSession, user_id: str) -> dict[str, str]:
    if not get_settings().allow_user_api_keys:
        return {}
    rows = (await db.execute(select(ProviderCredential).where(ProviderCredential.user_id == user_id))).scalars().all()
    out: dict[str, str] = {}
    for r in rows:
        v = decrypt_secret(r.encrypted_value)
        if v:
            out[r.provider] = v
    return out


def server_credential(provider: str) -> str | None:
    attr = SERVER_KEYS.get(provider)
    return getattr(get_settings(), attr) if attr else None


def build_adapter(provider: str, user_creds: dict[str, str] | None = None) -> ProviderAdapter:
    s = get_settings()
    cred = (user_creds or {}).get(provider) or server_credential(provider)
    cls = EXTRA_ADAPTERS.get(provider) or ADAPTERS.get(provider)
    if cls is None:
        raise KeyError(provider)
    if cls is ComfyUIAdapter:
        return ComfyUIAdapter(None, base_url=s.comfyui_url)
    if cls is DiffusersAdapter:
        return DiffusersAdapter(None, enabled=s.local_diffusers_enabled, device=s.local_diffusers_device, hf_token=s.hf_token)
    return cls(cred)


@dataclass
class RouteChoice:
    route: Route
    adapter: ProviderAdapter


def candidate_routes(model: ModelSpec, task: str, user_creds: dict[str, str], preferred: str | None = None,
                     provider_order: list[str] | None = None) -> list[RouteChoice]:
    """Configured routes for a task, ordered: explicit choice, user priority, catalog priority."""
    order = {p: i for i, p in enumerate(provider_order or [])}
    routes = [r for r in model.routes if task in r.endpoints]
    if preferred:
        routes.sort(key=lambda r: 0 if r.provider == preferred else 1)
    routes.sort(key=lambda r: (0 if preferred and r.provider == preferred else 1, order.get(r.provider, 100), r.priority))
    out: list[RouteChoice] = []
    for r in routes:
        if r.provider not in ADAPTERS and r.provider not in EXTRA_ADAPTERS:
            continue
        a = build_adapter(r.provider, user_creds)
        if a.is_configured():
            out.append(RouteChoice(r, a))
    return out


def model_availability(model: ModelSpec, user_creds: dict[str, str]) -> dict[str, Any]:
    routes = []
    for r in model.routes:
        if r.provider in ("anthropic", "openai_compat"):
            from ..services.llm import llm_configured

            ok = llm_configured(r.provider, user_creds)
            routes.append({"provider": r.provider, "configured": ok, "requires_key": True})
            continue
        if r.provider not in ADAPTERS:
            continue
        a = build_adapter(r.provider, user_creds)
        routes.append({"provider": r.provider, "configured": a.is_configured(), "requires_key": a.requires_key()})
    return {"available": any(x["configured"] for x in routes), "routes": routes}


_health_cache: dict[str, tuple[float, tuple[bool, str]]] = {}


async def provider_status(user_creds: dict[str, str], *, live: bool = False) -> list[dict[str, Any]]:
    from ..services.llm import llm_status
    from ..services.stock import STOCK_PROVIDERS

    async def one(pid: str, cls: type[ProviderAdapter]) -> dict[str, Any]:
        a = build_adapter(pid, user_creds)
        configured = a.is_configured()
        source = "usuario" if pid in user_creds else ("servidor" if server_credential(pid) else None)
        health: tuple[bool, str] | None = None
        if live and (configured or a.kind == "local"):
            cached = _health_cache.get(pid + (":u" if pid in user_creds else ""))
            if cached and time.time() - cached[0] < 60:
                health = cached[1]
            else:
                try:
                    health = await asyncio.wait_for(a.health(), timeout=12)
                except Exception as e:  # noqa: BLE001
                    health = (False, f"error: {type(e).__name__}")
                _health_cache[pid + (":u" if pid in user_creds else "")] = (time.time(), health)
        models = [m.id for m in MODELS if any(r.provider == pid for r in m.routes)]
        return {
            "id": pid, "name": cls.name, "kind": cls.kind, "homepage": cls.homepage, "docs_url": cls.docs_url,
            "requires_key": cls.requires_key() if pid not in ("comfyui", "diffusers") else False,
            "key_env": cls.key_env, "signup_url": cls.signup_url, "configured": configured, "key_source": source,
            "free_tier": cls.free_tier, "commercial_note": cls.commercial_note, "byok": pid in BYOK_PROVIDERS,
            "health": {"ok": health[0], "message": health[1]} if health else None,
            "models": models,
            "setup_hint": _setup_hint(pid),
        }

    results = await asyncio.gather(*(one(pid, cls) for pid, cls in ADAPTERS.items()))
    results += llm_status(user_creds)
    results += [s.status(user_creds) for s in STOCK_PROVIDERS.values()]
    return list(results)


def _setup_hint(pid: str) -> str:
    return {
        "comfyui": "Ejecuta ComfyUI (python main.py --listen) y define COMFYUI_URL. Descarga los checkpoints en models/checkpoints.",
        "diffusers": "En un worker con GPU: pip install -r requirements-gpu.txt y LOCAL_DIFFUSERS_ENABLED=true.",
        "local": "Incluido. Para eliminar fondos localmente instala rembg en el worker.",
    }.get(pid, "Añade la API key en el servidor (.env) o en Configuración → Claves API.")
