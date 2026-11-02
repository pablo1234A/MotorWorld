"""Text LLM access for story development and instruction planning.

Backends (tried in order, whichever is configured):
1. Anthropic Claude via the official SDK (default model ``claude-opus-5-5``,
   structured JSON output + server-side refusal fallback).
2. Any OpenAI-compatible Chat Completions endpoint (Groq, OpenRouter,
   Together, Hugging Face router, Google's OpenAI-compatible endpoint, or a
   local Ollama/LM Studio server — the latter is free).
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

import anthropic
import httpx

from ..config import get_settings
from ..providers.base import ProviderError, ProviderNotConfigured
from ..providers.registry import server_credential

log = logging.getLogger(__name__)


class LLMError(ProviderError):
    pass


def _openai_compat_settings(user_creds: dict[str, str]) -> tuple[str | None, str | None, str | None]:
    s = get_settings()
    return s.openai_compat_base_url, user_creds.get("openai_compat") or s.openai_compat_api_key, s.openai_compat_model


def llm_configured(provider: str, user_creds: dict[str, str]) -> bool:
    if provider == "anthropic":
        return bool(user_creds.get("anthropic") or server_credential("anthropic"))
    if provider == "openai_compat":
        base, _key, model = _openai_compat_settings(user_creds)
        return bool(base and model)  # local servers (Ollama) need no key
    return False


def llm_status(user_creds: dict[str, str]) -> list[dict[str, Any]]:
    s = get_settings()
    base, _, model = _openai_compat_settings(user_creds)
    return [
        {
            "id": "anthropic", "name": "Anthropic Claude", "kind": "llm", "homepage": "https://www.anthropic.com",
            "docs_url": "https://docs.claude.com", "requires_key": True, "key_env": "ANTHROPIC_API_KEY",
            "signup_url": "https://console.anthropic.com", "configured": llm_configured("anthropic", user_creds),
            "key_source": "usuario" if "anthropic" in user_creds else ("servidor" if s.anthropic_api_key else None),
            "free_tier": "API de pago por tokens (sin nivel gratuito permanente).",
            "commercial_note": "Uso comercial permitido según los términos de Anthropic.", "byok": True, "health": None,
            "models": ["llm"], "setup_hint": f"Modelo configurado: {s.anthropic_model}",
        },
        {
            "id": "openai_compat", "name": "LLM compatible con OpenAI (Ollama, Groq, OpenRouter…)", "kind": "llm",
            "homepage": "https://ollama.com", "docs_url": "https://github.com/ollama/ollama/blob/main/docs/openai.md",
            "requires_key": False, "key_env": "OPENAI_COMPAT_API_KEY", "signup_url": "",
            "configured": llm_configured("openai_compat", user_creds),
            "key_source": "usuario" if "openai_compat" in user_creds else ("servidor" if s.openai_compat_api_key else None),
            "free_tier": "Ollama/LM Studio locales: gratis. Groq y OpenRouter ofrecen niveles gratuitos con límites estrictos de uso.",
            "commercial_note": "Depende del modelo (p. ej. Llama, Qwen y Mistral tienen licencias distintas).", "byok": True,
            "health": None, "models": ["llm"],
            "setup_hint": f"Endpoint: {base or '—'} · modelo: {model or '—'} (define OPENAI_COMPAT_BASE_URL y OPENAI_COMPAT_MODEL)",
        },
    ]


def _extract_json(text: str) -> Any:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.S)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            return json.loads(m.group(0))
        raise


async def _anthropic_json(system: str, user: str, schema: dict[str, Any], api_key: str, effort: str) -> dict[str, Any]:
    s = get_settings()
    client = anthropic.AsyncAnthropic(api_key=api_key, timeout=600)
    try:
        async with client.beta.messages.stream(
            model=s.anthropic_model,
            max_tokens=32000,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        ) as stream:
            msg = await stream.get_final_message()
    except anthropic.AuthenticationError as e:
        raise LLMError("Anthropic: API key inválida", retryable=True, code="auth") from e
    except anthropic.RateLimitError as e:
        raise LLMError("Anthropic: límite de uso alcanzado; inténtalo más tarde", code="rate_limited") from e
    except anthropic.BadRequestError as e:
        raise LLMError(f"Anthropic rechazó la petición: {e.message}", retryable=False) from e
    except anthropic.APIStatusError as e:
        raise LLMError(f"Anthropic devolvió {e.status_code}") from e
    except anthropic.APIConnectionError as e:
        raise LLMError("No se pudo conectar con Anthropic") from e
    if msg.stop_reason == "refusal":
        raise LLMError("El modelo rechazó la solicitud por sus políticas de uso", retryable=False, code="moderated")
    if msg.stop_reason == "max_tokens":
        raise LLMError("La respuesta del modelo se truncó (demasiado larga); reduce el número de escenas", retryable=False)
    text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
    return _extract_json(text)


async def _openai_compat_json(system: str, user: str, schema: dict[str, Any], user_creds: dict[str, str]) -> dict[str, Any]:
    base, key, model = _openai_compat_settings(user_creds)
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system + "\n\nResponde SOLO con un objeto JSON válido que cumpla este JSON Schema:\n" + json.dumps(schema, ensure_ascii=False)},
            {"role": "user", "content": user},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.7,
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(600, connect=15), trust_env=True) as c:
            r = await c.post(base.rstrip("/") + "/chat/completions", headers=headers, json=body)
    except httpx.HTTPError as e:
        raise LLMError(f"No se pudo conectar con {base}: {type(e).__name__}") from e
    if r.status_code in (401, 403):
        raise LLMError("LLM compatible: API key inválida", code="auth")
    if r.status_code >= 400:
        raise LLMError(f"LLM compatible devolvió {r.status_code}: {r.text[:300]}", retryable=r.status_code >= 500)
    try:
        return _extract_json(r.json()["choices"][0]["message"]["content"])
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        raise LLMError("El LLM no devolvió JSON válido", retryable=True) from e


async def complete_json(system: str, user: str, schema: dict[str, Any], user_creds: dict[str, str], *,
                        prefer: str | None = None, effort: str = "high") -> tuple[dict[str, Any], str]:
    order = ["anthropic", "openai_compat"]
    if prefer in order:
        order.remove(prefer)
        order.insert(0, prefer)
    errors: list[str] = []
    for provider in order:
        if not llm_configured(provider, user_creds):
            continue
        try:
            if provider == "anthropic":
                key = user_creds.get("anthropic") or server_credential("anthropic")
                return await _anthropic_json(system, user, schema, key, effort), provider
            return await _openai_compat_json(system, user, schema, user_creds), provider
        except LLMError as e:
            errors.append(f"{provider}: {e}")
            if not e.retryable:
                raise
    if not errors:
        raise ProviderNotConfigured(
            "No hay ningún LLM configurado. Añade ANTHROPIC_API_KEY o un endpoint compatible con OpenAI "
            "(p. ej. Ollama local: OPENAI_COMPAT_BASE_URL=http://localhost:11434/v1, OPENAI_COMPAT_MODEL=qwen2.5:14b)."
        )
    raise LLMError(" | ".join(errors))


def any_llm_configured(user_creds: dict[str, str]) -> bool:
    return llm_configured("anthropic", user_creds) or llm_configured("openai_compat", user_creds)
