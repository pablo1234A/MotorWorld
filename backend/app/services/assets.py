from __future__ import annotations

import logging
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..errors import not_found, payload_too_large
from ..media import MediaInfo, inspect, make_thumbnail
from ..models import Asset
from ..storage import get_storage, make_key, tmp_path

log = logging.getLogger(__name__)


async def user_storage_bytes(db: AsyncSession, user_id: str) -> int:
    res = await db.execute(
        select(func.coalesce(func.sum(Asset.size_bytes), 0)).where(Asset.user_id == user_id, Asset.deleted_at.is_(None))
    )
    return int(res.scalar_one())


async def check_quota(db: AsyncSession, user_id: str, incoming: int) -> None:
    quota = get_settings().user_storage_quota_mb * 1024 * 1024
    used = await user_storage_bytes(db, user_id)
    if used + incoming > quota:
        raise payload_too_large(
            f"Cuota de almacenamiento superada ({used / 1e9:.2f} GB usados de {quota / 1e9:.2f} GB). Elimina archivos o amplía la cuota."
        )


async def ingest_file(
    db: AsyncSession,
    *,
    user_id: str,
    path: Path,
    source: str,
    name: str = "",
    parent_id: str | None = None,
    generation_id: str | None = None,
    project_id: str | None = None,
    meta: dict | None = None,
    info: MediaInfo | None = None,
    check_user_quota: bool = True,
) -> Asset:
    """Validate a local file, upload it (and its thumbnail) to storage and create the Asset row."""
    info = info or await inspect(path)
    size = path.stat().st_size
    if check_user_quota:
        await check_quota(db, user_id, size)
    storage = get_storage()
    key = make_key(user_id, info.kind, info.ext)
    await storage.put_file(key, path, info.mime)
    thumb_key = None
    thumb = tmp_path(".webp" if info.kind == "image" else ".jpg" if info.kind == "video" else ".png")
    try:
        if await make_thumbnail(path, info, thumb):
            thumb_key = make_key(user_id, "thumbs", thumb.suffix)
            ctype = {".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png"}[thumb.suffix]
            await storage.put_file(thumb_key, thumb, ctype)
    finally:
        thumb.unlink(missing_ok=True)
    asset = Asset(
        user_id=user_id,
        project_id=project_id,
        parent_id=parent_id,
        generation_id=generation_id,
        kind=info.kind,
        source=source,
        name=(name or f"{info.kind}.{info.ext}")[:255],
        storage_key=key,
        thumbnail_key=thumb_key,
        mime=info.mime,
        size_bytes=size,
        width=info.width,
        height=info.height,
        duration=info.duration,
        fps=info.fps,
        has_audio=info.has_audio,
        meta={**(meta or {}), **({"codec": info.extra} if info.extra else {})},
    )
    db.add(asset)
    await db.flush()
    return asset


async def get_user_asset(db: AsyncSession, user_id: str, asset_id: str) -> Asset:
    asset = await db.get(Asset, asset_id)
    if asset is None or asset.user_id != user_id or asset.deleted_at is not None:
        raise not_found("Archivo")
    return asset


async def asset_local_copy(asset: Asset, suffix: str | None = None) -> Path:
    """Materialise an asset on local disk for processing (caller must delete it)."""
    dest = tmp_path(suffix or "." + asset.storage_key.rsplit(".", 1)[-1])
    return await get_storage().download_to(asset.storage_key, dest)


def asset_to_dict(asset: Asset) -> dict:
    base = f"/api/assets/{asset.id}"
    return {
        "id": asset.id,
        "kind": asset.kind,
        "source": asset.source,
        "name": asset.name,
        "mime": asset.mime,
        "size_bytes": asset.size_bytes,
        "width": asset.width,
        "height": asset.height,
        "duration": asset.duration,
        "fps": asset.fps,
        "has_audio": asset.has_audio,
        "is_favorite": asset.is_favorite,
        "project_id": asset.project_id,
        "parent_id": asset.parent_id,
        "generation_id": asset.generation_id,
        "meta": asset.meta or {},
        "created_at": asset.created_at.isoformat() if asset.created_at else None,
        "url": f"{base}/file",
        "download_url": f"{base}/file?download=1",
        "thumbnail_url": f"{base}/thumbnail" if asset.thumbnail_key else None,
    }
