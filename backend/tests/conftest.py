from __future__ import annotations

import asyncio
import io
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest
import pytest_asyncio

_TMP = Path(tempfile.mkdtemp(prefix="mwtest-"))
os.environ.update({
    "ENVIRONMENT": "test",
    "DATABASE_URL": os.environ.get("TEST_DATABASE_URL", f"sqlite+aiosqlite:///{_TMP}/test.db"),
    "QUEUE_MODE": "inline",
    "REDIS_URL": os.environ.get("TEST_REDIS_URL", "redis://127.0.0.1:6/0"),
    "STORAGE_BACKEND": "local",
    "STORAGE_LOCAL_PATH": str(_TMP / "storage"),
    "TMP_DIR": str(_TMP / "tmp"),
    "PROVIDER_POLL_INTERVAL": "0.01",
    "RATE_LIMIT_PER_MINUTE": "10000",
    "AUTH_RATE_LIMIT_PER_MINUTE": "10000",
    "CORS_ORIGINS": "http://localhost:3000",
    # make sure no real provider keys leak into tests
    "REPLICATE_API_TOKEN": "", "FAL_KEY": "", "HF_TOKEN": "", "BFL_API_KEY": "", "ELEVENLABS_API_KEY": "",
    "ANTHROPIC_API_KEY": "", "OPENAI_COMPAT_BASE_URL": "", "COMFYUI_URL": "",
})

from httpx import ASGITransport, AsyncClient  # noqa: E402
from PIL import Image  # noqa: E402

from app import db as dbmod  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.redis_client import reset_memory_limits  # noqa: E402

get_settings.cache_clear()


@pytest.fixture(scope="session")
def media_dir() -> Path:
    d = _TMP / "media"
    d.mkdir(exist_ok=True)
    ff = shutil.which("ffmpeg")
    assert ff, "ffmpeg is required for the test-suite"
    subprocess.run([ff, "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=3", "-f", "lavfi", "-i",
                    "sine=frequency=330:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(d / "a.mp4")], check=True)
    subprocess.run([ff, "-v", "error", "-y", "-f", "lavfi", "-i", "mandelbrot=size=640x360:rate=24", "-t", "2", "-c:v", "libx264",
                    "-pix_fmt", "yuv420p", str(d / "b_noaudio.mp4")], check=True)
    subprocess.run([ff, "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=550:duration=4", str(d / "tone.wav")], check=True)
    img = Image.new("RGB", (512, 384), "#224466")
    for x in range(0, 512, 32):
        for y in range(0, 384, 32):
            if (x + y) // 32 % 2:
                img.paste((230, 120, 40), (x, y, x + 32, y + 32))
    img.save(d / "img.png")
    (d / "fake.png").write_bytes(b"<html><script>alert(1)</script></html>")
    return d


def png_bytes(color="#ff0000", size=(64, 48)) -> bytes:
    b = io.BytesIO()
    Image.new("RGB", size, color).save(b, "PNG")
    return b.getvalue()


@pytest_asyncio.fixture
async def app():
    from app.main import create_app
    from app.storage import reset_storage

    await dbmod.reset_engine()
    reset_storage()
    reset_memory_limits()
    engine = dbmod.get_engine()
    async with engine.begin() as conn:
        from app import models  # noqa: F401

        await conn.run_sync(dbmod.Base.metadata.drop_all)
        await conn.run_sync(dbmod.Base.metadata.create_all)
    get_settings().tmp_dir.mkdir(parents=True, exist_ok=True)
    application = create_app()
    yield application
    from app.services.queue import wait_inline

    await wait_inline(30)
    await dbmod.reset_engine()


async def _client(app) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver", headers={"origin": "http://localhost:3000"})


async def register(client: AsyncClient, email: str, password: str = "Sup3rSecreta!") -> dict:
    r = await client.post("/api/auth/register", json={"email": email, "password": password, "display_name": email.split("@")[0], "accept_terms": True})
    assert r.status_code == 201, r.text
    return r.json()


@pytest_asyncio.fixture
async def client(app):
    async with await _client(app) as c:
        await register(c, "ana@example.com")
        yield c


@pytest_asyncio.fixture
async def client_b(app):
    async with await _client(app) as c:
        await register(c, "bruno@example.com")
        yield c


@pytest_asyncio.fixture
async def anon(app):
    async with await _client(app) as c:
        yield c


async def upload(client: AsyncClient, path: Path, name: str | None = None) -> dict:
    with path.open("rb") as fh:
        r = await client.post("/api/assets", files={"file": (name or path.name, fh, "application/octet-stream")})
    assert r.status_code == 201, r.text
    return r.json()


async def wait_job(client: AsyncClient, gid: str, timeout: float = 120) -> dict:
    from app.services.queue import wait_inline

    loop = asyncio.get_event_loop()
    end = loop.time() + timeout
    while True:
        r = await client.get(f"/api/generations/{gid}")
        d = r.json()
        if d["status"] in ("completed", "failed", "cancelled"):
            return d
        if loop.time() > end:
            raise AssertionError(f"job {gid} did not finish: {d}")
        await asyncio.sleep(0.05)
        await wait_inline(0.01)
