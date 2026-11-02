"""Object storage abstraction: local filesystem (dev) or any S3-compatible
service (AWS S3, MinIO, Cloudflare R2, Supabase Storage S3 endpoint...)."""
from __future__ import annotations

import asyncio
import shutil
import uuid
from abc import ABC, abstractmethod
from pathlib import Path

from .config import get_settings


class Storage(ABC):
    @abstractmethod
    async def put_file(self, key: str, src: Path, content_type: str) -> None: ...

    @abstractmethod
    async def put_bytes(self, key: str, data: bytes, content_type: str) -> None: ...

    @abstractmethod
    async def download_to(self, key: str, dest: Path) -> Path: ...

    @abstractmethod
    async def read_bytes(self, key: str) -> bytes: ...

    @abstractmethod
    async def delete(self, key: str) -> None: ...

    @abstractmethod
    async def exists(self, key: str) -> bool: ...

    def local_path(self, key: str) -> Path | None:
        """Direct filesystem path when available (local backend only)."""
        return None

    async def presigned_url(self, key: str, *, filename: str | None = None, expires: int | None = None) -> str | None:
        return None


def _safe_key(key: str) -> str:
    if ".." in key.split("/") or key.startswith("/"):
        raise ValueError("invalid storage key")
    return key


class LocalStorage(Storage):
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        p = (self.root / _safe_key(key)).resolve()
        if not str(p).startswith(str(self.root)):
            raise ValueError("invalid storage key")
        return p

    def local_path(self, key: str) -> Path | None:
        return self._path(key)

    async def put_file(self, key: str, src: Path, content_type: str) -> None:
        dest = self._path(key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(shutil.copyfile, src, dest)

    async def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        dest = self._path(key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(dest.write_bytes, data)

    async def download_to(self, key: str, dest: Path) -> Path:
        dest.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(shutil.copyfile, self._path(key), dest)
        return dest

    async def read_bytes(self, key: str) -> bytes:
        return await asyncio.to_thread(self._path(key).read_bytes)

    async def delete(self, key: str) -> None:
        p = self._path(key)
        if p.exists():
            await asyncio.to_thread(p.unlink)

    async def exists(self, key: str) -> bool:
        return self._path(key).exists()


class S3Storage(Storage):
    def __init__(self):
        import boto3
        from botocore.config import Config

        s = get_settings()
        self.bucket = s.s3_bucket
        common = dict(
            region_name=s.s3_region,
            aws_access_key_id=s.s3_access_key,
            aws_secret_access_key=s.s3_secret_key,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )
        self.client = boto3.client("s3", endpoint_url=s.s3_endpoint_url, **common)
        # Presigned URLs must be signed for the host the *browser* uses.
        self.public_client = boto3.client("s3", endpoint_url=s.s3_public_endpoint_url or s.s3_endpoint_url, **common)

    async def ensure_bucket(self) -> None:
        def _ensure():
            try:
                self.client.head_bucket(Bucket=self.bucket)
            except Exception:  # noqa: BLE001
                self.client.create_bucket(Bucket=self.bucket)

        await asyncio.to_thread(_ensure)

    async def put_file(self, key: str, src: Path, content_type: str) -> None:
        await asyncio.to_thread(
            self.client.upload_file, str(src), self.bucket, _safe_key(key), ExtraArgs={"ContentType": content_type}
        )

    async def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        await asyncio.to_thread(
            self.client.put_object, Bucket=self.bucket, Key=_safe_key(key), Body=data, ContentType=content_type
        )

    async def download_to(self, key: str, dest: Path) -> Path:
        dest.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(self.client.download_file, self.bucket, _safe_key(key), str(dest))
        return dest

    async def read_bytes(self, key: str) -> bytes:
        def _read():
            return self.client.get_object(Bucket=self.bucket, Key=_safe_key(key))["Body"].read()

        return await asyncio.to_thread(_read)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self.client.delete_object, Bucket=self.bucket, Key=_safe_key(key))

    async def exists(self, key: str) -> bool:
        def _head():
            try:
                self.client.head_object(Bucket=self.bucket, Key=_safe_key(key))
                return True
            except Exception:  # noqa: BLE001
                return False

        return await asyncio.to_thread(_head)

    async def presigned_url(self, key: str, *, filename: str | None = None, expires: int | None = None) -> str | None:
        params = {"Bucket": self.bucket, "Key": _safe_key(key)}
        if filename:
            params["ResponseContentDisposition"] = f'attachment; filename="{filename}"'
        return await asyncio.to_thread(
            self.public_client.generate_presigned_url,
            "get_object",
            Params=params,
            ExpiresIn=expires or get_settings().s3_presign_seconds,
        )


_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        s = get_settings()
        _storage = S3Storage() if s.storage_backend == "s3" else LocalStorage(s.storage_local_path)
    return _storage


def reset_storage() -> None:
    global _storage
    _storage = None


def make_key(user_id: str, kind: str, ext: str) -> str:
    ext = ext.lstrip(".").lower() or "bin"
    uid = uuid.uuid4().hex
    return f"users/{user_id}/{kind}/{uid[:2]}/{uid}.{ext}"


def tmp_path(suffix: str = "") -> Path:
    d = get_settings().tmp_dir
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{uuid.uuid4().hex}{suffix}"
