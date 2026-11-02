from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..errors import bad_request
from ..media import MediaError
from ..models import User
from ..providers.http import download
from ..providers.registry import user_credentials
from ..services import stock
from ..services.assets import asset_to_dict, ingest_file
from ..storage import tmp_path

router = APIRouter(prefix="/api/stock", tags=["recursos gratuitos"])


@router.get("/search")
async def search(provider: str, q: str, media: str = "image", page: int = 1, user: User = Depends(get_current_user),
                 db: AsyncSession = Depends(get_db)):
    creds = await user_credentials(db, user.id)
    try:
        items = await stock.search(provider, q[:200], media, creds, page)
    except PermissionError as e:
        raise bad_request(f"{e}. Consíguela gratis en la web del proveedor y añádela en Configuración.", code="provider_not_configured")
    except ValueError as e:
        raise bad_request(str(e))
    except httpx.HTTPError as e:
        raise bad_request(f"El proveedor de stock no respondió: {type(e).__name__}", code="provider_error")
    return {"items": items, "provider": provider}


class ImportIn(BaseModel):
    provider: str
    item: dict[str, Any]
    project_id: str | None = None


@router.post("/import", status_code=201)
async def import_item(body: ImportIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    url = str(body.item.get("download") or "")
    host = urlparse(url).hostname or ""
    if urlparse(url).scheme != "https" or not any(host == h or host.endswith("." + h) for h in stock.ALLOWED_DOWNLOAD_HOSTS):
        raise bad_request("URL de descarga no permitida")
    creds = await user_credentials(db, user.id)
    if body.provider == "unsplash" and body.item.get("download_location"):
        await stock.unsplash_track_download(str(body.item["download_location"]), creds)
    path = tmp_path(".bin")
    try:
        await download(url, path, max_bytes=500 * 1024 * 1024)
        try:
            asset = await ingest_file(db, user_id=user.id, path=path, source="stock", project_id=body.project_id,
                                      name=f"{body.provider}-{body.item.get('id')}",
                                      meta={"stock": {"provider": body.provider, "id": body.item.get("id"), "author": body.item.get("author"),
                                                      "author_url": body.item.get("author_url"), "page_url": body.item.get("page_url"),
                                                      "attribution": body.item.get("attribution")}})
        except MediaError as e:
            raise bad_request(str(e))
        await db.commit()
        return asset_to_dict(asset)
    finally:
        path.unlink(missing_ok=True)
