from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..errors import bad_request, conflict, not_found
from ..models import Film, Project, User
from ..providers.registry import user_credentials
from ..services.film import (
    assemble_timeline, character_sheet_prompt, shot_image_prompt, shot_reference_assets, shot_video_prompt,
)
from ..services.film_schema import Script
from ..services.generation import create_generation, generation_to_dict
from ..services.llm import any_llm_configured

router = APIRouter(prefix="/api/films", tags=["estudio de películas"])


class FilmIn(BaseModel):
    title: str = Field("Nueva película", max_length=200)
    idea: str = Field("", max_length=20000)
    project_id: str | None = None
    aspect_ratio: str = Field("16:9", pattern=r"^(16:9|9:16|1:1|21:9|4:3)$")


def film_to_dict(f: Film) -> dict[str, Any]:
    return {"id": f.id, "title": f.title, "idea": f.idea, "script": Script.model_validate(f.script or {}).model_dump(),
            "timeline_id": f.timeline_id, "project_id": f.project_id, "version": f.version,
            "created_at": f.created_at.isoformat(), "updated_at": f.updated_at.isoformat() if f.updated_at else None}


async def _owned(db: AsyncSession, user: User, fid: str) -> Film:
    f = await db.get(Film, fid)
    if f is None or f.user_id != user.id:
        raise not_found("Película")
    return f


@router.get("")
async def list_films(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Film).where(Film.user_id == user.id).order_by(Film.updated_at.desc()))).scalars().all()
    out = []
    for f in rows:
        s = Script.model_validate(f.script or {})
        cover = next((sh.keyframe_asset_id for sc in s.scenes for sh in sc.shots if sh.keyframe_asset_id), None)
        out.append({"id": f.id, "title": f.title, "logline": s.logline, "scene_count": len(s.scenes),
                    "shot_count": sum(len(sc.shots) for sc in s.scenes), "cover_url": f"/api/assets/{cover}/thumbnail" if cover else None,
                    "updated_at": f.updated_at.isoformat() if f.updated_at else None})
    return {"items": out}


@router.post("", status_code=201)
async def create_film(body: FilmIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if body.project_id:
        p = await db.get(Project, body.project_id)
        if p is None or p.user_id != user.id:
            raise not_found("Proyecto")
    script = Script()
    script.style.aspect_ratio = body.aspect_ratio
    f = Film(user_id=user.id, title=body.title, idea=body.idea, project_id=body.project_id, script=script.model_dump())
    db.add(f)
    await db.commit()
    return film_to_dict(f)


@router.get("/{fid}")
async def get_film(fid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return film_to_dict(await _owned(db, user, fid))


class FilmPatch(BaseModel):
    title: str | None = Field(None, max_length=200)
    idea: str | None = Field(None, max_length=20000)
    script: dict[str, Any] | None = None
    version: int | None = None  # optimistic concurrency


@router.put("/{fid}")
async def save_film(fid: str, body: FilmPatch, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    f = await _owned(db, user, fid)
    if body.version is not None and body.version != f.version:
        raise conflict("La película se modificó en otra pestaña o por un trabajo en curso. Recarga para ver la última versión.",
                       code="version_conflict")
    if body.title is not None:
        f.title = body.title
    if body.idea is not None:
        f.idea = body.idea
    if body.script is not None:
        try:
            s = Script.model_validate(body.script)
        except Exception as e:  # noqa: BLE001
            raise bad_request(f"Guion no válido: {e}")
        s.renumber()
        f.script = s.model_dump()
    f.version = (f.version or 1) + 1
    await db.commit()
    return film_to_dict(f)


@router.delete("/{fid}")
async def delete_film(fid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.delete(await _owned(db, user, fid))
    await db.commit()
    return {"ok": True}


class DevelopIn(BaseModel):
    idea: str = Field(min_length=10, max_length=20000)
    language: str = "es"
    target_duration_s: int = Field(60, ge=10, le=1800)
    genre: str = ""
    tone: str = ""
    max_scenes: int = Field(6, ge=1, le=30)


@router.post("/{fid}/develop", status_code=201)
async def develop(fid: str, body: DevelopIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    f = await _owned(db, user, fid)
    if not any_llm_configured(await user_credentials(db, user.id)):
        raise bad_request("Para desarrollar el guion con IA configura un LLM: ANTHROPIC_API_KEY, o un servidor compatible con OpenAI "
                          "(Ollama local es gratuito). También puedes escribir el guion manualmente.", code="llm_not_configured")
    f.idea = body.idea
    await db.commit()
    gen = await create_generation(db, user, task="film_develop", model_id="llm", prompt=body.idea, project_id=f.project_id,
                                  params={"film_id": f.id, "mode": "full", **body.model_dump(exclude={"idea"})})
    return generation_to_dict(gen)


class RewriteIn(BaseModel):
    scene_id: str
    instruction: str = Field(min_length=3, max_length=5000)


@router.post("/{fid}/rewrite-scene", status_code=201)
async def rewrite(fid: str, body: RewriteIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    f = await _owned(db, user, fid)
    if not any_llm_configured(await user_credentials(db, user.id)):
        raise bad_request("Configura un LLM para reescribir escenas con IA", code="llm_not_configured")
    gen = await create_generation(db, user, task="film_develop", model_id="llm", prompt=body.instruction, project_id=f.project_id,
                                  params={"film_id": f.id, "mode": "rewrite_scene", "scene_id": body.scene_id})
    return generation_to_dict(gen)


class ProduceIn(BaseModel):
    step: str = Field(pattern="^(character_refs|keyframes|clips|dialogue|sfx|music)$")
    target_ids: list[str] = Field(default_factory=list)
    model_id: str | None = None
    reference_model: str | None = None
    provider: str | None = None
    overwrite: bool = False


@router.post("/{fid}/produce", status_code=201)
async def produce(fid: str, body: ProduceIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    f = await _owned(db, user, fid)
    gen = await create_generation(db, user, task="film_batch", model_id="pipeline", prompt=f"Producción: {body.step}",
                                  project_id=f.project_id, params={"film_id": f.id, **body.model_dump(exclude_none=True)})
    return generation_to_dict(gen)


@router.get("/{fid}/shots/{shot_id}/prompts")
async def shot_prompts(fid: str, shot_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Preview the exact prompts (with consistency anchors) that will be sent."""
    f = await _owned(db, user, fid)
    s = Script.model_validate(f.script or {})
    sc, sh = s.find_shot(shot_id)
    if sh is None:
        raise not_found("Plano")
    return {"image_prompt": shot_image_prompt(s, sc, sh), "video_prompt": shot_video_prompt(s, sc, sh, s.style.video_model),
            "reference_asset_ids": shot_reference_assets(s, sh)}


@router.get("/{fid}/characters/{cid}/prompt")
async def character_prompt(fid: str, cid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    f = await _owned(db, user, fid)
    s = Script.model_validate(f.script or {})
    ch = s.character(cid)
    if ch is None:
        raise not_found("Personaje")
    return {"prompt": character_sheet_prompt(s, ch)}


@router.post("/{fid}/assemble")
async def assemble(fid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    f = await _owned(db, user, fid)
    tl = await assemble_timeline(db, f)
    return {"timeline_id": tl.id}
