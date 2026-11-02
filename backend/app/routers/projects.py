from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..errors import not_found
from ..models import Asset, Film, Generation, Project, Timeline, User

router = APIRouter(prefix="/api/projects", tags=["proyectos"])


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field("", max_length=5000)
    kind: str = Field("general", pattern="^(general|film|ad|music|social)$")
    data: dict[str, Any] = Field(default_factory=dict)


class ProjectPatch(BaseModel):
    name: str | None = Field(None, max_length=200)
    description: str | None = Field(None, max_length=5000)
    kind: str | None = Field(None, pattern="^(general|film|ad|music|social)$")
    cover_asset_id: str | None = None
    data: dict[str, Any] | None = None


def project_to_dict(p: Project, counts: dict[str, int] | None = None) -> dict[str, Any]:
    return {"id": p.id, "name": p.name, "description": p.description, "kind": p.kind, "data": p.data or {},
            "cover_asset_id": p.cover_asset_id, "cover_url": f"/api/assets/{p.cover_asset_id}/thumbnail" if p.cover_asset_id else None,
            "created_at": p.created_at.isoformat(), "updated_at": p.updated_at.isoformat() if p.updated_at else None, **(counts or {})}


async def _owned(db: AsyncSession, user: User, pid: str) -> Project:
    p = await db.get(Project, pid)
    if p is None or p.user_id != user.id:
        raise not_found("Proyecto")
    return p


async def _counts(db: AsyncSession, pid: str) -> dict[str, int]:
    a = (await db.execute(select(func.count()).select_from(Asset).where(Asset.project_id == pid, Asset.deleted_at.is_(None)))).scalar_one()
    g = (await db.execute(select(func.count()).select_from(Generation).where(Generation.project_id == pid, Generation.deleted_at.is_(None)))).scalar_one()
    f = (await db.execute(select(func.count()).select_from(Film).where(Film.project_id == pid))).scalar_one()
    t = (await db.execute(select(func.count()).select_from(Timeline).where(Timeline.project_id == pid))).scalar_one()
    return {"asset_count": a, "generation_count": g, "film_count": f, "timeline_count": t}


@router.get("")
async def list_projects(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Project).where(Project.user_id == user.id).order_by(Project.updated_at.desc()))).scalars().all()
    return {"items": [project_to_dict(p, await _counts(db, p.id)) for p in rows]}


@router.post("", status_code=201)
async def create_project(body: ProjectIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = Project(user_id=user.id, name=body.name.strip(), description=body.description, kind=body.kind, data=body.data)
    db.add(p)
    await db.commit()
    return project_to_dict(p, await _counts(db, p.id))


@router.get("/{pid}")
async def get_project(pid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await _owned(db, user, pid)
    films = (await db.execute(select(Film).where(Film.project_id == pid, Film.user_id == user.id))).scalars().all()
    tls = (await db.execute(select(Timeline).where(Timeline.project_id == pid, Timeline.user_id == user.id))).scalars().all()
    return {**project_to_dict(p, await _counts(db, pid)),
            "films": [{"id": f.id, "title": f.title, "updated_at": f.updated_at.isoformat()} for f in films],
            "timelines": [{"id": t.id, "name": t.name, "updated_at": t.updated_at.isoformat()} for t in tls]}


@router.patch("/{pid}")
async def patch_project(pid: str, body: ProjectPatch, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await _owned(db, user, pid)
    for field in ("name", "description", "kind", "data"):
        v = getattr(body, field)
        if v is not None:
            setattr(p, field, v)
    if body.cover_asset_id:
        a = await db.get(Asset, body.cover_asset_id)
        if a is None or a.user_id != user.id:
            raise not_found("Archivo")
        p.cover_asset_id = a.id
    await db.commit()
    return project_to_dict(p, await _counts(db, pid))


@router.delete("/{pid}")
async def delete_project(pid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Deletes the project container; its files stay in the library (unassigned)."""
    p = await _owned(db, user, pid)
    await db.delete(p)
    await db.commit()
    return {"ok": True}
