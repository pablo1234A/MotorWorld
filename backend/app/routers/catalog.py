from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..errors import bad_request, not_found
from ..models import User
from ..providers.catalog import MODELS, TASK_LABELS, get_model
from ..providers.elevenlabs import ElevenLabsAdapter
from ..providers.registry import build_adapter, model_availability, provider_status, user_credentials
from ..services.ffmpeg_ops import AUDIO_OPS, COLOR_PRESETS, VIDEO_OPS
from ..services.image_ops import SUPPORTED_OPS
from ..services.prompting import options_payload

router = APIRouter(prefix="/api", tags=["modelos y proveedores"])


@router.get("/models")
async def list_models(category: str | None = None, task: str | None = None, free: bool | None = None, local: bool | None = None,
                      include_internal: bool = False, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    creds = await user_credentials(db, user.id)
    out = []
    for m in MODELS:
        if "internal" in m.tags and not include_internal:
            continue
        if category and m.category != category:
            continue
        if task and task not in m.tasks:
            continue
        is_free = m.local_only or "free" in m.tags or any((r.price and r.price.usd == 0.0) for r in m.routes)
        is_local = m.local_only or any(r.provider in ("comfyui", "diffusers", "local") for r in m.routes)
        if free is not None and is_free != free:
            continue
        if local is not None and is_local != local:
            continue
        d = m.to_public()
        d.update(model_availability(m, creds))
        d["is_free_option"] = is_free
        d["has_local_route"] = is_local
        out.append(d)
    return {"items": out, "tasks": TASK_LABELS}


@router.get("/models/{model_id}")
async def model_detail(model_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    m = get_model(model_id)
    if m is None:
        raise not_found("Modelo")
    d = m.to_public()
    d.update(model_availability(m, await user_credentials(db, user.id)))
    return d


@router.get("/providers")
async def providers(live: bool = False, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return {"items": await provider_status(await user_credentials(db, user.id), live=live)}


@router.get("/providers/elevenlabs/voices")
async def elevenlabs_voices(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    a = build_adapter("elevenlabs", await user_credentials(db, user.id))
    if not a.is_configured():
        raise bad_request("Configura ELEVENLABS_API_KEY para listar voces", code="provider_not_configured")
    assert isinstance(a, ElevenLabsAdapter)
    return {"items": await a.voices()}


@router.get("/options")
async def options(user: User = Depends(get_current_user)):
    return {**options_payload(), "image_ops": SUPPORTED_OPS, "video_ops": VIDEO_OPS, "audio_ops": AUDIO_OPS,
            "color_presets": list(COLOR_PRESETS.keys())}
