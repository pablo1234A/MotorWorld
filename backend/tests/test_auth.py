from app.services.email import OUTBOX

from .conftest import register


async def test_register_login_session(anon):
    d = await register(anon, "Carla@Example.com")
    assert d["user"]["email"] == "carla@example.com"
    assert "mw_access" in anon.cookies
    me = await anon.get("/api/me")
    assert me.status_code == 200 and me.json()["email"] == "carla@example.com"
    # bearer auth works for API clients too
    r = await anon.get("/api/me", headers={"authorization": f"Bearer {d['access_token']}"}, cookies={})
    assert r.status_code == 200


async def test_register_validation(anon):
    r = await anon.post("/api/auth/register", json={"email": "x@example.com", "password": "corta", "accept_terms": True})
    assert r.status_code == 422
    r = await anon.post("/api/auth/register", json={"email": "x@example.com", "password": "Sup3rSecreta!", "accept_terms": False})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "terms_required"
    await register(anon, "dup@example.com")
    r = await anon.post("/api/auth/register", json={"email": "DUP@example.com", "password": "Sup3rSecreta!", "accept_terms": True})
    assert r.status_code == 409


async def test_login_logout_and_refresh_rotation(anon):
    await register(anon, "eva@example.com")
    anon.cookies.clear()
    bad = await anon.post("/api/auth/login", json={"email": "eva@example.com", "password": "Incorrecta123"})
    assert bad.status_code == 401
    ok = await anon.post("/api/auth/login", json={"email": "eva@example.com", "password": "Sup3rSecreta!"})
    assert ok.status_code == 200
    old_refresh = anon.cookies.get("mw_refresh")
    assert old_refresh
    r = await anon.post("/api/auth/refresh", json={"refresh_token": old_refresh})
    assert r.status_code == 200
    # Reusing a rotated refresh token revokes all sessions
    anon.cookies.clear()
    reuse = await anon.post("/api/auth/refresh", json={"refresh_token": old_refresh})
    assert reuse.status_code == 401
    out = await anon.post("/api/auth/logout")
    assert out.status_code == 200
    assert (await anon.get("/api/me")).status_code == 401


async def test_password_reset_flow(anon):
    await register(anon, "fran@example.com")
    OUTBOX.clear()
    r = await anon.post("/api/auth/forgot-password", json={"email": "fran@example.com"})
    assert r.status_code == 200
    r2 = await anon.post("/api/auth/forgot-password", json={"email": "nadie@example.com"})
    assert r2.json() == r.json()  # no user enumeration
    assert len(OUTBOX) == 1
    token = OUTBOX[0]["token"]
    r = await anon.post("/api/auth/reset-password", json={"token": token, "password": "NuevaClave2024"})
    assert r.status_code == 200
    again = await anon.post("/api/auth/reset-password", json={"token": token, "password": "OtraClave2024x"})
    assert again.status_code == 400
    anon.cookies.clear()
    ok = await anon.post("/api/auth/login", json={"email": "fran@example.com", "password": "NuevaClave2024"})
    assert ok.status_code == 200


async def test_profile_preferences_and_keys(client):
    r = await client.patch("/api/me", json={"display_name": "Ana Directora", "preferences": {"language": "es", "is_admin": True}})
    assert r.status_code == 200
    assert r.json()["display_name"] == "Ana Directora"
    assert "is_admin" not in r.json()["preferences"] and r.json()["is_admin"] is False
    r = await client.put("/api/me/keys/replicate", json={"value": "r8_abcdefghijklmnop1234"})
    assert r.status_code == 200 and r.json()["hint"] == "…1234"
    keys = (await client.get("/api/me/keys")).json()["keys"]
    rep = next(k for k in keys if k["provider"] == "replicate")
    assert rep["configured"] and "abcdef" not in str(keys)  # never returned in clear
    from app.db import get_sessionmaker
    from app.models import ProviderCredential
    from sqlalchemy import select

    async with get_sessionmaker()() as db:
        row = (await db.execute(select(ProviderCredential))).scalar_one()
        assert "abcdefghij" not in row.encrypted_value  # encrypted at rest
    providers = (await client.get("/api/providers")).json()["items"]
    rp = next(p for p in providers if p["id"] == "replicate")
    assert rp["configured"] and rp["key_source"] == "usuario"
    assert (await client.delete("/api/me/keys/replicate")).status_code == 200


async def test_change_password_and_cross_origin_block(client):
    r = await client.post("/api/me/password", json={"current_password": "mal", "new_password": "Nuev4Clave2025"})
    assert r.status_code == 400
    r = await client.post("/api/me/password", json={"current_password": "Sup3rSecreta!", "new_password": "Nuev4Clave2025"})
    assert r.status_code == 200
    evil = await client.post("/api/projects", json={"name": "x"}, headers={"origin": "https://evil.example"})
    assert evil.status_code == 403


async def test_requires_auth(anon):
    for path in ("/api/assets", "/api/generations", "/api/projects", "/api/films", "/api/timelines", "/api/models"):
        assert (await anon.get(path)).status_code == 401, path
