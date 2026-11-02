from __future__ import annotations

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .db import get_db
from .errors import too_many, unauthorized
from .models import User
from .redis_client import rate_limit_hit
from .security import decode_access_token

ACCESS_COOKIE = "mw_access"
REFRESH_COOKIE = "mw_refresh"


def _extract_token(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return request.cookies.get(ACCESS_COOKIE)


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    token = _extract_token(request)
    if not token:
        raise unauthorized("Debes iniciar sesión")
    payload = decode_access_token(token)
    if not payload:
        raise unauthorized()
    user = await db.get(User, payload["sub"])
    if user is None or not user.is_active:
        raise unauthorized()
    request.state.user_id = user.id
    if not await rate_limit_hit(f"user:{user.id}", get_settings().rate_limit_per_minute):
        raise too_many("Demasiadas solicitudes. Espera un momento.")
    return user


async def auth_rate_limit(request: Request) -> None:
    ip = request.client.host if request.client else "unknown"
    if not await rate_limit_hit(f"auth:{ip}", get_settings().auth_rate_limit_per_minute):
        raise too_many("Demasiados intentos. Prueba de nuevo en un minuto.")
