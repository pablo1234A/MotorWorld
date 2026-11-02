from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse, RedirectResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_db
from ..deps import get_current_user
from ..errors import bad_request, not_found, payload_too_large, unauthorized
from ..media import MediaError, inspect
from ..models import Asset, Project, User
from ..security import decode_access_token, sign_media_token, verify_media_token
from ..services.assets import asset_to_dict, check_quota, get_user_asset, ingest_file, user_storage_bytes
from ..services.image_ops import normalise_mask
from ..storage import get_storage, tmp_path
from ..deps import ACCESS_COOKIE

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/assets", tags=["biblioteca"])


async def _save_upload(file: UploadFile, limit_bytes: int) -> tuple:
    suffix = "." + (file.filename or "upload").rsplit(".", 1)[-1][:8] if "." in (file.filename or "") else ""
    dest = tmp_path(suffix.lower())
    size = 0
    with dest.open("wb") as fh:
        while chunk := await file.read(1 << 20):
            size += len(chunk)
            if size > limit_bytes:
                fh.close()
                dest.unlink(missing_ok=True)
                raise payload_too_large(f"El archivo supera el máximo de {limit_bytes // (1024 * 1024)} MB")
            fh.write(chunk)
    return dest, size


@router.post("", status_code=201)
async def upload(request: Request, file: UploadFile = File(...), project_id: str | None = Form(None), name: str | None = Form(None),
                 user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    s = get_settings()
    cl = request.headers.get("content-length")
    if cl and int(cl) > s.max_upload_mb * 1024 * 1024 + 1024 * 64:
        raise payload_too_large(f"El archivo supera el máximo de {s.max_upload_mb} MB")
    if project_id:
        p = await db.get(Project, project_id)
        if p is None or p.user_id != user.id:
            raise not_found("Proyecto")
    path, size = await _save_upload(file, s.max_upload_mb * 1024 * 1024)
    try:
        try:
            info = await inspect(path)
        except MediaError as e:
            raise bad_request(str(e), code="invalid_media")
        if info.kind == "image" and size > s.max_image_upload_mb * 1024 * 1024:
            raise payload_too_large(f"Las imágenes no pueden superar {s.max_image_upload_mb} MB")
        await check_quota(db, user.id, size)
        asset = await ingest_file(db, user_id=user.id, path=path, source="upload", name=(name or file.filename or "")[:255],
                                  project_id=project_id, info=info, check_user_quota=False)
        await db.commit()
        return asset_to_dict(asset)
    finally:
        path.unlink(missing_ok=True)


@router.post("/{asset_id}/mask", status_code=201)
async def upload_mask(asset_id: str, file: UploadFile = File(...), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Upload a mask drawn in the editor; it is normalised to a binary mask at the image's size."""
    base = await get_user_asset(db, user.id, asset_id)
    if base.kind != "image":
        raise bad_request("Las máscaras solo se aplican a imágenes")
    path, _ = await _save_upload(file, 20 * 1024 * 1024)
    try:
        try:
            info = await inspect(path)
        except MediaError as e:
            raise bad_request(str(e), code="invalid_media")
        if info.kind != "image":
            raise bad_request("La máscara debe ser una imagen PNG")
        norm = normalise_mask(path, (base.width or info.width, base.height or info.height))
        asset = await ingest_file(db, user_id=user.id, path=norm, source="mask", parent_id=base.id, name=f"{base.name}-mascara")
        await db.commit()
        norm.unlink(missing_ok=True)
        return asset_to_dict(asset)
    finally:
        path.unlink(missing_ok=True)


@router.get("")
async def list_assets(kind: str | None = None, source: str | None = None, favorite: bool | None = None, project_id: str | None = None,
                      q: str | None = None, include_masks: bool = False, limit: int = Query(48, le=200), offset: int = 0,
                      user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = select(Asset).where(Asset.user_id == user.id, Asset.deleted_at.is_(None))
    if kind:
        stmt = stmt.where(Asset.kind == kind)
    if source:
        stmt = stmt.where(Asset.source == source)
    elif not include_masks:
        stmt = stmt.where(Asset.source != "mask")
    if favorite is not None:
        stmt = stmt.where(Asset.is_favorite.is_(favorite))
    if project_id:
        stmt = stmt.where(Asset.project_id == project_id)
    if q:
        stmt = stmt.where(or_(Asset.name.ilike(f"%{q}%")))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await db.execute(stmt.order_by(Asset.created_at.desc()).limit(limit).offset(offset))).scalars().all()
    return {"items": [asset_to_dict(a) for a in rows], "total": total, "limit": limit, "offset": offset}


@router.get("/usage")
async def usage(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    used = await user_storage_bytes(db, user.id)
    return {"used_bytes": used, "quota_bytes": get_settings().user_storage_quota_mb * 1024 * 1024}


@router.get("/{asset_id}")
async def get_asset(asset_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return asset_to_dict(await get_user_asset(db, user.id, asset_id))


@router.get("/{asset_id}/lineage")
async def lineage(asset_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Edit history: ancestors (original first) and direct descendants."""
    a = await get_user_asset(db, user.id, asset_id)
    chain = [a]
    seen = {a.id}
    while chain[0].parent_id and len(chain) < 100:
        p = await db.get(Asset, chain[0].parent_id)
        if p is None or p.user_id != user.id or p.id in seen:
            break
        seen.add(p.id)
        chain.insert(0, p)
    root = chain[0]
    # whole tree under the root (breadth first), excluding masks
    tree: list[Asset] = []
    frontier = [root.id]
    while frontier and len(tree) < 300:
        kids = (await db.execute(select(Asset).where(Asset.parent_id.in_(frontier), Asset.user_id == user.id, Asset.deleted_at.is_(None),
                                                     Asset.source != "mask").order_by(Asset.created_at))).scalars().all()
        tree += kids
        frontier = [k.id for k in kids]
    return {"ancestors": [asset_to_dict(x) for x in chain], "descendants": [asset_to_dict(x) for x in tree], "root_id": root.id}


class AssetPatch(BaseModel):
    name: str | None = Field(None, max_length=255)
    is_favorite: bool | None = None
    project_id: str | None = None
    clear_project: bool = False


@router.patch("/{asset_id}")
async def patch_asset(asset_id: str, body: AssetPatch, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    a = await get_user_asset(db, user.id, asset_id)
    if body.name is not None:
        a.name = body.name
    if body.is_favorite is not None:
        a.is_favorite = body.is_favorite
    if body.project_id:
        p = await db.get(Project, body.project_id)
        if p is None or p.user_id != user.id:
            raise not_found("Proyecto")
        a.project_id = p.id
    if body.clear_project:
        a.project_id = None
    await db.commit()
    return asset_to_dict(a)


@router.delete("/{asset_id}")
async def delete_asset(asset_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    a = await get_user_asset(db, user.id, asset_id)
    a.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    storage = get_storage()
    for key in (a.storage_key, a.thumbnail_key):
        if key:
            try:
                await storage.delete(key)
            except Exception:  # noqa: BLE001
                log.warning("delete failed for %s", key)
    return {"ok": True}


@router.post("/{asset_id}/media-token")
async def media_token(asset_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await get_user_asset(db, user.id, asset_id)
    return {"token": sign_media_token(asset_id, user.id), "expires_in": 3600}


async def _authorize_file(request: Request, asset_id: str, token: str | None, db: AsyncSession) -> Asset:
    user_id = None
    if token:
        user_id = verify_media_token(token, asset_id)
    if user_id is None:
        raw = request.cookies.get(ACCESS_COOKIE)
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            raw = auth[7:]
        payload = decode_access_token(raw) if raw else None
        user_id = payload["sub"] if payload else None
    if user_id is None:
        raise unauthorized()
    a = await db.get(Asset, asset_id)
    if a is None or a.user_id != user_id or a.deleted_at is not None:
        raise not_found("Archivo")
    return a


def _download_name(a: Asset) -> str:
    ext = a.storage_key.rsplit(".", 1)[-1]
    base = "".join(c for c in (a.name or a.id) if c.isalnum() or c in "-_ .").strip() or a.id
    return base if base.lower().endswith("." + ext) else f"{base}.{ext}"


@router.get("/{asset_id}/file")
async def get_file(asset_id: str, request: Request, download: bool = False, token: str | None = None, db: AsyncSession = Depends(get_db)):
    a = await _authorize_file(request, asset_id, token, db)
    storage = get_storage()
    local = storage.local_path(a.storage_key)
    headers = {"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"}
    if local is not None:
        if not local.exists():
            raise not_found("Archivo")
        return FileResponse(local, media_type=a.mime, filename=_download_name(a) if download else None, headers=headers,
                            content_disposition_type="attachment" if download else "inline")
    url = await storage.presigned_url(a.storage_key, filename=_download_name(a) if download else None)
    return RedirectResponse(url, status_code=307)


@router.get("/{asset_id}/thumbnail")
async def get_thumbnail(asset_id: str, request: Request, token: str | None = None, db: AsyncSession = Depends(get_db)):
    a = await _authorize_file(request, asset_id, token, db)
    if not a.thumbnail_key:
        raise not_found("Miniatura")
    storage = get_storage()
    local = storage.local_path(a.thumbnail_key)
    mime = "image/webp" if a.thumbnail_key.endswith(".webp") else ("image/png" if a.thumbnail_key.endswith(".png") else "image/jpeg")
    if local is not None:
        return FileResponse(local, media_type=mime, headers={"Cache-Control": "private, max-age=86400"})
    data = await storage.read_bytes(a.thumbnail_key)
    return Response(data, media_type=mime, headers={"Cache-Control": "private, max-age=86400"})
