"""S3-compatible storage backend (AWS S3 / MinIO / R2 / Supabase Storage) against moto's S3 emulator."""
import pytest
from moto import mock_aws

from .conftest import upload


@pytest.fixture
def s3_settings(monkeypatch):
    from app.config import get_settings
    from app.storage import reset_storage

    s = get_settings()
    monkeypatch.setattr(s, "storage_backend", "s3")
    monkeypatch.setattr(s, "s3_endpoint_url", None)
    monkeypatch.setattr(s, "s3_access_key", "test")
    monkeypatch.setattr(s, "s3_secret_key", "test")
    monkeypatch.setattr(s, "s3_bucket", "mw-test")
    with mock_aws():
        reset_storage()
        yield s
    reset_storage()


async def test_s3_roundtrip(s3_settings, tmp_path):
    from app.storage import S3Storage, get_storage

    st = get_storage()
    assert isinstance(st, S3Storage)
    await st.ensure_bucket()
    src = tmp_path / "a.txt"
    src.write_text("hola")
    await st.put_file("users/u/x.txt", src, "text/plain")
    assert await st.exists("users/u/x.txt")
    assert await st.read_bytes("users/u/x.txt") == b"hola"
    url = await st.presigned_url("users/u/x.txt", filename="x.txt")
    assert "X-Amz-Signature" in url and "response-content-disposition" in url
    await st.delete("users/u/x.txt")
    assert not await st.exists("users/u/x.txt")
    with pytest.raises(ValueError):
        await st.put_bytes("../escape", b"x", "text/plain")


async def test_upload_and_download_redirect_with_s3(s3_settings, client, media_dir):
    from app.storage import get_storage

    await get_storage().ensure_bucket()
    a = await upload(client, media_dir / "img.png")
    r = await client.get(a["url"], follow_redirects=False)
    assert r.status_code == 307 and "X-Amz-Signature" in r.headers["location"]
    t = await client.get(a["thumbnail_url"])
    assert t.status_code == 200 and t.headers["content-type"] == "image/webp"
