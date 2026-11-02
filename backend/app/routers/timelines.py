from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse, Response
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..errors import bad_request, conflict, not_found
from ..models import Asset, Project, Timeline, User
from ..services.generation import create_generation, generation_to_dict
from ..services.timeline import TimelineData, empty_timeline, to_otio, to_srt

router = APIRouter(prefix="/api/timelines", tags=["montaje"])


def tl_to_dict(t: Timeline) -> dict[str, Any]:
    return {"id": t.id, "name": t.name, "project_id": t.project_id, "data": t.data, "version": t.version,
            "last_render_asset_id": t.last_render_asset_id, "created_at": t.created_at.isoformat(),
            "updated_at": t.updated_at.isoformat() if t.updated_at else None}


async def _owned(db: AsyncSession, user: User, tid: str) -> Timeline:
    t = await db.get(Timeline, tid)
    if t is None or t.user_id != user.id:
        raise not_found("Línea temporal")
    return t


async def _validate(db: AsyncSession, user: User, data: dict[str, Any]) -> dict[str, Any]:
    try:
        td = TimelineData.model_validate(data)
    except ValidationError as e:
        raise bad_request(f"Línea temporal no válida: {e.errors()[0]['msg']}")
    for aid in td.asset_ids():
        a = await db.get(Asset, aid)
        if a is None or a.user_id != user.id or a.deleted_at is not None:
            raise bad_request("La línea temporal contiene archivos que no existen", code="input_not_found")
    return td.model_dump(by_alias=True)


class TimelineIn(BaseModel):
    name: str = Field("Nuevo montaje", max_length=200)
    project_id: str | None = None
    data: dict[str, Any] | None = None


@router.get("")
async def list_timelines(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Timeline).where(Timeline.user_id == user.id).order_by(Timeline.updated_at.desc()))).scalars().all()
    return {"items": [{k: v for k, v in tl_to_dict(t).items() if k != "data"} for t in rows]}


@router.post("", status_code=201)
async def create_timeline(body: TimelineIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if body.project_id:
        p = await db.get(Project, body.project_id)
        if p is None or p.user_id != user.id:
            raise not_found("Proyecto")
    data = await _validate(db, user, body.data) if body.data else empty_timeline()
    t = Timeline(user_id=user.id, project_id=body.project_id, name=body.name, data=data)
    db.add(t)
    await db.commit()
    return tl_to_dict(t)


@router.get("/{tid}")
async def get_timeline(tid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return tl_to_dict(await _owned(db, user, tid))


class TimelineSave(BaseModel):
    name: str | None = Field(None, max_length=200)
    data: dict[str, Any] | None = None
    version: int | None = None


@router.put("/{tid}")
async def save_timeline(tid: str, body: TimelineSave, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    t = await _owned(db, user, tid)
    if body.version is not None and body.version != t.version:
        raise conflict("El montaje cambió en otra pestaña. Recarga para continuar.", code="version_conflict")
    if body.name is not None:
        t.name = body.name
    if body.data is not None:
        t.data = await _validate(db, user, body.data)
    t.version = (t.version or 1) + 1
    await db.commit()
    return tl_to_dict(t)


@router.delete("/{tid}")
async def delete_timeline(tid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.delete(await _owned(db, user, tid))
    await db.commit()
    return {"ok": True}


@router.post("/{tid}/render", status_code=201)
async def render(tid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    t = await _owned(db, user, tid)
    td = TimelineData.model_validate(t.data or {})
    main = next((tr for tr in td.tracks if tr.kind == "video" and not tr.muted), None)
    if main is None or not main.clips:
        raise bad_request("Añade al menos un clip a la pista de vídeo principal", code="empty_timeline")
    gen = await create_generation(db, user, task="timeline_render", model_id="local-ffmpeg", prompt=f"Render: {t.name}",
                                  project_id=t.project_id, params={"timeline_id": t.id})
    return generation_to_dict(gen)


@router.get("/{tid}/export.srt")
async def export_srt(tid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    t = await _owned(db, user, tid)
    return PlainTextResponse(to_srt(TimelineData.model_validate(t.data or {})), media_type="application/x-subrip",
                             headers={"Content-Disposition": f'attachment; filename="{t.id}.srt"'})


@router.get("/{tid}/export.otio")
async def export_otio(tid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    t = await _owned(db, user, tid)
    td = TimelineData.model_validate(t.data or {})
    names = {a.id: a.name for a in (await db.execute(select(Asset).where(Asset.id.in_(td.asset_ids()), Asset.user_id == user.id))).scalars()}
    return Response(to_otio(td, t.name, names), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="{t.id}.otio"'})
