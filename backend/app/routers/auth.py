from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_db
from ..deps import ACCESS_COOKIE, REFRESH_COOKIE, auth_rate_limit, get_current_user
from ..errors import AppError, bad_request, conflict, unauthorized
from ..models import PasswordResetToken, ProviderCredential, RefreshSession, User
from ..providers.registry import BYOK_PROVIDERS
from ..security import (
    create_access_token, encrypt_secret, hash_password, hash_token, needs_rehash, new_opaque_token, verify_password,
)
from ..services.email import send_password_reset

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])
me_router = APIRouter(prefix="/api/me", tags=["perfil"])


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class PasswordMixin(BaseModel):
    @staticmethod
    def check_password(v: str) -> str:
        if len(v) < 10:
            raise ValueError("La contraseña debe tener al menos 10 caracteres")
        if v.lower() == v or v.upper() == v or not any(c.isdigit() for c in v):
            raise ValueError("Usa mayúsculas, minúsculas y al menos un número")
        return v


class RegisterIn(PasswordMixin):
    email: EmailStr
    password: str = Field(max_length=200)
    display_name: str = Field("", max_length=120)
    accept_terms: bool

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:  # noqa: N805
        return cls.check_password(v)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=200)


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(PasswordMixin):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(max_length=200)

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:  # noqa: N805
        return cls.check_password(v)


class ChangePasswordIn(PasswordMixin):
    current_password: str
    new_password: str = Field(max_length=200)

    @field_validator("new_password")
    @classmethod
    def _pw(cls, v: str) -> str:  # noqa: N805
        return cls.check_password(v)


class ProfileIn(BaseModel):
    display_name: str | None = Field(None, max_length=120)
    preferences: dict[str, Any] | None = None


def user_to_dict(u: User) -> dict[str, Any]:
    return {"id": u.id, "email": u.email, "display_name": u.display_name, "preferences": u.preferences or {},
            "is_admin": u.is_admin, "created_at": u.created_at.isoformat() if u.created_at else None}


def _set_cookies(resp: Response, access: str, refresh: str | None) -> None:
    s = get_settings()
    common = dict(httponly=True, secure=s.cookie_secure, samesite="lax", domain=s.cookie_domain)
    resp.set_cookie(ACCESS_COOKIE, access, max_age=s.access_token_minutes * 60, path="/", **common)
    if refresh:
        resp.set_cookie(REFRESH_COOKIE, refresh, max_age=s.refresh_token_days * 86400, path="/api/auth", **common)


def _clear_cookies(resp: Response) -> None:
    s = get_settings()
    resp.delete_cookie(ACCESS_COOKIE, path="/", domain=s.cookie_domain)
    resp.delete_cookie(REFRESH_COOKIE, path="/api/auth", domain=s.cookie_domain)


async def _issue_session(db: AsyncSession, user: User, request: Request, resp: Response) -> dict[str, Any]:
    s = get_settings()
    refresh = new_opaque_token()
    db.add(RefreshSession(user_id=user.id, token_hash=hash_token(refresh), expires_at=utcnow() + timedelta(days=s.refresh_token_days),
                          user_agent=(request.headers.get("user-agent") or "")[:300], ip=request.client.host if request.client else ""))
    await db.commit()
    access = create_access_token(user.id)
    _set_cookies(resp, access, refresh)
    return {"user": user_to_dict(user), "access_token": access, "token_type": "bearer", "expires_in": s.access_token_minutes * 60}


@router.post("/register", status_code=201, dependencies=[Depends(auth_rate_limit)])
async def register(body: RegisterIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    if not body.accept_terms:
        raise bad_request("Debes aceptar las condiciones de uso y la política de privacidad", code="terms_required")
    email = body.email.lower().strip()
    exists = (await db.execute(select(User.id).where(User.email == email))).scalar_one_or_none()
    if exists:
        raise conflict("Ya existe una cuenta con ese email", code="email_taken")
    user = User(email=email, password_hash=hash_password(body.password), display_name=body.display_name.strip() or email.split("@")[0],
                preferences={"terms_accepted_at": utcnow().isoformat(), "provider_order": []})
    db.add(user)
    await db.flush()
    return await _issue_session(db, user, request, response)


@router.post("/login", dependencies=[Depends(auth_rate_limit)])
async def login(body: LoginIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email == body.email.lower().strip()))).scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash) or not user.is_active:
        raise unauthorized("Email o contraseña incorrectos")
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
    return await _issue_session(db, user, request, response)


@router.post("/refresh")
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        body = {}
        try:
            body = await request.json()
        except Exception:  # noqa: BLE001
            pass
        token = body.get("refresh_token") if isinstance(body, dict) else None
    if not token:
        raise unauthorized()
    sess = (await db.execute(select(RefreshSession).where(RefreshSession.token_hash == hash_token(token)))).scalar_one_or_none()
    if sess is None or sess.revoked_at is not None or _aware(sess.expires_at) < utcnow():
        if sess is not None and sess.revoked_at is not None:
            # Reuse of a rotated token: revoke every session of the user (token theft protection).
            await db.execute(update(RefreshSession).where(RefreshSession.user_id == sess.user_id).values(revoked_at=utcnow()))
            await db.commit()
        _clear_cookies(response)
        raise unauthorized()
    user = await db.get(User, sess.user_id)
    if user is None or not user.is_active:
        raise unauthorized()
    sess.revoked_at = utcnow()  # rotation
    return await _issue_session(db, user, request, response)


@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get(REFRESH_COOKIE)
    if token:
        await db.execute(update(RefreshSession).where(RefreshSession.token_hash == hash_token(token)).values(revoked_at=utcnow()))
        await db.commit()
    _clear_cookies(response)
    return {"ok": True}


@router.post("/forgot-password", dependencies=[Depends(auth_rate_limit)])
async def forgot_password(body: ForgotIn, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email == body.email.lower().strip()))).scalar_one_or_none()
    if user is not None and user.is_active:
        token = new_opaque_token()
        db.add(PasswordResetToken(user_id=user.id, token_hash=hash_token(token),
                                  expires_at=utcnow() + timedelta(minutes=get_settings().password_reset_minutes)))
        await db.commit()
        await send_password_reset(user.email, token)
    # Same answer whether or not the account exists (no user enumeration).
    return {"ok": True, "message": "Si existe una cuenta con ese email, recibirás un enlace para restablecer la contraseña."}


@router.post("/reset-password", dependencies=[Depends(auth_rate_limit)])
async def reset_password(body: ResetIn, response: Response, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_token(body.token)))).scalar_one_or_none()
    if row is None or row.used_at is not None or _aware(row.expires_at) < utcnow():
        raise bad_request("El enlace no es válido o ha caducado", code="invalid_token")
    user = await db.get(User, row.user_id)
    if user is None:
        raise bad_request("El enlace no es válido o ha caducado", code="invalid_token")
    user.password_hash = hash_password(body.password)
    row.used_at = utcnow()
    await db.execute(update(RefreshSession).where(RefreshSession.user_id == user.id).values(revoked_at=utcnow()))
    await db.commit()
    _clear_cookies(response)
    return {"ok": True}


# ---------------------------------------------------------------------------
@me_router.get("")
async def me(user: User = Depends(get_current_user)):
    return user_to_dict(user)


@me_router.patch("")
async def update_me(body: ProfileIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if body.display_name is not None:
        user.display_name = body.display_name.strip()
    if body.preferences is not None:
        allowed = {"language", "default_image_model", "default_video_model", "provider_order", "theme", "show_costs",
                   "default_aspect_ratio", "autosave", "email_notifications"}
        prefs = dict(user.preferences or {})
        for k, v in body.preferences.items():
            if k in allowed:
                prefs[k] = v
        if "provider_order" in prefs and not isinstance(prefs["provider_order"], list):
            raise bad_request("provider_order debe ser una lista")
        user.preferences = prefs
    await db.commit()
    return user_to_dict(user)


@me_router.post("/password")
async def change_password(body: ChangePasswordIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise bad_request("La contraseña actual no es correcta", code="wrong_password")
    user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"ok": True}


@me_router.get("/sessions")
async def sessions(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(RefreshSession).where(RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None))
                             .order_by(RefreshSession.created_at.desc()))).scalars().all()
    return [{"id": r.id, "user_agent": r.user_agent, "ip": r.ip, "created_at": r.created_at.isoformat()} for r in rows
            if _aware(r.expires_at) > utcnow()]


@me_router.post("/sessions/revoke-all")
async def revoke_all(response: Response, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(RefreshSession).where(RefreshSession.user_id == user.id).values(revoked_at=utcnow()))
    await db.commit()
    _clear_cookies(response)
    return {"ok": True}


class KeyIn(BaseModel):
    value: str = Field(min_length=8, max_length=500)


@me_router.get("/keys")
async def list_keys(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(ProviderCredential).where(ProviderCredential.user_id == user.id))).scalars().all()
    have = {r.provider: r for r in rows}
    return {"enabled": get_settings().allow_user_api_keys,
            "keys": [{"provider": p, "configured": p in have, "hint": have[p].hint if p in have else None,
                      "updated_at": have[p].created_at.isoformat() if p in have else None} for p in BYOK_PROVIDERS]}


@me_router.put("/keys/{provider}")
async def set_key(provider: str, body: KeyIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not get_settings().allow_user_api_keys:
        raise AppError(403, "byok_disabled", "Este servidor no permite claves propias")
    if provider not in BYOK_PROVIDERS:
        raise bad_request("Proveedor desconocido")
    value = body.value.strip()
    row = (await db.execute(select(ProviderCredential).where(ProviderCredential.user_id == user.id,
                                                             ProviderCredential.provider == provider))).scalar_one_or_none()
    if row is None:
        row = ProviderCredential(user_id=user.id, provider=provider, encrypted_value="", hint="")
        db.add(row)
    row.encrypted_value = encrypt_secret(value)
    row.hint = "…" + value[-4:]
    row.created_at = utcnow()
    await db.commit()
    return {"provider": provider, "configured": True, "hint": row.hint}


@me_router.delete("/keys/{provider}")
async def delete_key(provider: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(ProviderCredential).where(ProviderCredential.user_id == user.id, ProviderCredential.provider == provider))
    await db.commit()
    return {"ok": True}


@me_router.delete("")
async def delete_account(body: LoginIn, response: Response, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """GDPR: delete the account and every file it owns."""
    if body.email.lower() != user.email or not verify_password(body.password, user.password_hash):
        raise bad_request("Confirma con tu email y contraseña", code="wrong_password")
    from ..models import Asset
    from ..storage import get_storage

    keys = (await db.execute(select(Asset.storage_key, Asset.thumbnail_key).where(Asset.user_id == user.id))).all()
    storage = get_storage()
    for k, t in keys:
        for key in (k, t):
            if key:
                try:
                    await storage.delete(key)
                except Exception:  # noqa: BLE001
                    log.warning("could not delete %s", key)
    await db.delete(user)
    await db.commit()
    _clear_cookies(response)
    return {"ok": True}
