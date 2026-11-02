from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..errors import bad_request, not_found
from ..models import ACTIVE_STATUSES, Asset, Generation, Project, User
from ..providers.catalog import get_model
from ..services.generation import (
    create_generation, duplicate_generation, generation_to_dict, request_cancel, retry_generation,
)
from ..services.prompting import compose_image_prompt, compose_video_prompt

router = APIRouter(prefix="/api/generations", tags=["generaciones"])

VIDEO_TASKS = {"text_to_video", "image_to_video", "first_last_to_video", "video_to_video"}
IMAGE_TASKS = {"text_to_image", "image_to_image"}


class GenerationIn(BaseModel):
    task: str
    model_id: str
    prompt: str = Field("", max_length=8000)
    negative_prompt: str = Field("", max_length=4000)
    params: dict[str, Any] = Field(default_factory=dict)
    inputs: dict[str, str | list[str]] = Field(default_factory=dict)
    project_id: str | None = None
    provider: str | None = None
    style: str | None = None
    composition: str | None = None
    cinema: dict[str, Any] | None = None
    film_link: dict[str, Any] | None = None


def _validate_params(model_id: str, params: dict[str, Any]) -> dict[str, Any]:
    """Keep only parameters the model declares (+ internal/pipeline keys), validating ranges."""
    m = get_model(model_id)
    if m is None:
        raise bad_request(f"Modelo desconocido: {model_id}", code="unknown_model")
    declared = {p.name: p for p in m.params}
    passthrough = {"ops", "mix", "volumes", "delays", "timeline_id", "steps", "film_id", "step", "target_ids", "overwrite",
                   "mode", "scene_id", "language", "target_duration_s", "genre", "tone", "max_scenes", "i2v_model", "i2v_params",
                   "join", "post_ops", "extend", "mask_asset_id", "reference_model", "model_id", "user_prompt", "shots", "continuity",
                   "video_model", "video_params", "transition"}
    out: dict[str, Any] = {}
    for k, v in params.items():
        if v is None or v == "":
            continue
        if k in passthrough:
            out[k] = v
            continue
        spec = declared.get(k)
        if spec is None:
            continue  # silently drop unsupported controls: never pretend they work
        if spec.type in ("int", "float", "seed"):
            try:
                v = float(v)
            except (TypeError, ValueError):
                raise bad_request(f"{spec.label}: valor numérico no válido")
            if spec.min is not None and v < spec.min or spec.max is not None and v > spec.max:
                raise bad_request(f"{spec.label}: debe estar entre {spec.min} y {spec.max}")
            v = int(v) if spec.type in ("int", "seed") else v
        elif spec.type == "enum" and spec.options and v not in spec.options and str(v) not in [str(o) for o in spec.options]:
            raise bad_request(f"{spec.label}: opción no válida")
        elif spec.type == "bool":
            v = bool(v)
        out[k] = v
    return out


@router.post("", status_code=201)
async def create(body: GenerationIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if body.project_id:
        p = await db.get(Project, body.project_id)
        if p is None or p.user_id != user.id:
            raise not_found("Proyecto")
    params = _validate_params(body.model_id, body.params)
    prompt, negative = body.prompt.strip(), body.negative_prompt.strip()
    if body.task in IMAGE_TASKS or body.task == "image_edit":
        if body.style or body.composition:
            params["user_prompt"] = prompt
            prompt, style_neg = compose_image_prompt(prompt, body.style, body.composition)
            params["style"] = body.style
            if style_neg and not negative:
                negative = style_neg
    if body.task in VIDEO_TASKS and body.cinema:
        params["user_prompt"] = prompt
        params["cinema"] = {k: v for k, v in body.cinema.items() if isinstance(v, str)}
        prompt = compose_video_prompt(prompt, body.cinema, body.model_id)
    needs_prompt = body.task in IMAGE_TASKS | VIDEO_TASKS | {"image_edit", "inpaint", "text_to_speech", "text_to_music", "text_to_sfx"}
    if needs_prompt and not prompt and body.task not in ("image_to_video",):
        raise bad_request("Escribe un prompt", code="prompt_required")
    if body.task in ("text_to_speech",):
        params["_text_len"] = len(prompt)
    if body.film_link:
        params["_film_link"] = {k: body.film_link[k] for k in ("film_id", "kind", "shot_id", "line", "character_id", "location_id")
                                if k in body.film_link}
    gen = await create_generation(db, user, task=body.task, model_id=body.model_id, prompt=prompt, negative_prompt=negative,
                                  params=params, inputs=body.inputs, project_id=body.project_id, provider=body.provider)
    return generation_to_dict(gen)


async def _owned(db: AsyncSession, user: User, gid: str) -> Generation:
    g = await db.get(Generation, gid)
    if g is None or g.user_id != user.id or g.deleted_at is not None:
        raise not_found("Generación")
    return g


async def _with_assets(db: AsyncSession, gens: list[Generation]) -> list[dict[str, Any]]:
    ids = {a for g in gens for a in (g.output_asset_ids or [])}
    assets = {}
    if ids:
        assets = {a.id: a for a in (await db.execute(select(Asset).where(Asset.id.in_(ids), Asset.deleted_at.is_(None)))).scalars()}
    return [generation_to_dict(g, assets) for g in gens]


@router.get("")
async def list_generations(status: str | None = None, task: str | None = None, project_id: str | None = None, saved: bool | None = None,
                           active: bool = False, include_children: bool = False, limit: int = Query(30, le=100), offset: int = 0,
                           user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = select(Generation).where(Generation.user_id == user.id, Generation.deleted_at.is_(None))
    if status:
        stmt = stmt.where(Generation.status == status)
    if active:
        stmt = stmt.where(Generation.status.in_(ACTIVE_STATUSES))
    if task:
        stmt = stmt.where(Generation.task.in_(task.split(",")))
    if project_id:
        stmt = stmt.where(Generation.project_id == project_id)
    if saved is not None:
        stmt = stmt.where(Generation.is_saved.is_(saved))
    if not include_children:
        stmt = stmt.where(Generation.is_child.is_(False))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await db.execute(stmt.order_by(Generation.created_at.desc()).limit(limit).offset(offset))).scalars().all()
    return {"items": await _with_assets(db, list(rows)), "total": total, "limit": limit, "offset": offset}


@router.get("/{gid}")
async def get_generation(gid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    g = await _owned(db, user, gid)
    d = (await _with_assets(db, [g]))[0]
    children = (await db.execute(select(Generation).where(Generation.parent_generation_id == g.id, Generation.user_id == user.id)
                                 .order_by(Generation.created_at))).scalars().all()
    d["children"] = await _with_assets(db, list(children))
    return d


@router.post("/{gid}/cancel")
async def cancel(gid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    g = await request_cancel(db, await _owned(db, user, gid))
    return generation_to_dict(g)


@router.post("/{gid}/retry")
async def retry(gid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    g = await retry_generation(db, user, await _owned(db, user, gid))
    return generation_to_dict(g)


class DuplicateIn(BaseModel):
    prompt: str | None = None
    model_id: str | None = None
    provider: str | None = None
    params: dict[str, Any] | None = None


@router.post("/{gid}/duplicate", status_code=201)
async def duplicate(gid: str, body: DuplicateIn | None = None, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    g = await _owned(db, user, gid)
    overrides = body.model_dump(exclude_none=True) if body else {}
    if "params" in overrides:
        overrides["params"] = _validate_params(overrides.get("model_id") or g.model_id, overrides["params"])
    new = await duplicate_generation(db, user, g, overrides)
    return generation_to_dict(new)


class GenPatch(BaseModel):
    is_saved: bool | None = None


@router.patch("/{gid}")
async def patch(gid: str, body: GenPatch, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    g = await _owned(db, user, gid)
    if body.is_saved is not None:
        g.is_saved = body.is_saved
    await db.commit()
    return generation_to_dict(g)


@router.delete("/{gid}")
async def delete(gid: str, delete_outputs: bool = False, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    g = await _owned(db, user, gid)
    if g.status in ACTIVE_STATUSES:
        raise bad_request("Cancela el trabajo antes de eliminarlo", code="active")
    now = datetime.now(timezone.utc)
    g.deleted_at = now
    if delete_outputs:
        from ..storage import get_storage

        for aid in g.output_asset_ids or []:
            a = await db.get(Asset, aid)
            if a and a.user_id == user.id and a.deleted_at is None:
                a.deleted_at = now
                for key in (a.storage_key, a.thumbnail_key):
                    if key:
                        try:
                            await get_storage().delete(key)
                        except Exception:  # noqa: BLE001
                            pass
    await db.commit()
    return {"ok": True}
