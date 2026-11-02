"""Media inspection, validation and thumbnailing (Pillow + ffprobe/ffmpeg)."""
from __future__ import annotations

import asyncio
import json
import logging
import mimetypes
from dataclasses import dataclass, field
from pathlib import Path

import filetype
from PIL import Image, ImageOps

from .config import get_settings

log = logging.getLogger(__name__)

Image.MAX_IMAGE_PIXELS = 120_000_000  # decompression-bomb guard (~11k x 11k)

ALLOWED_MIME: dict[str, tuple[str, str]] = {
    # mime: (kind, extension)
    "image/png": ("image", "png"),
    "image/jpeg": ("image", "jpg"),
    "image/webp": ("image", "webp"),
    "image/gif": ("image", "gif"),
    "video/mp4": ("video", "mp4"),
    "video/webm": ("video", "webm"),
    "video/quicktime": ("video", "mov"),
    "video/x-matroska": ("video", "mkv"),
    "audio/mpeg": ("audio", "mp3"),
    "audio/x-wav": ("audio", "wav"),
    "audio/wav": ("audio", "wav"),
    "audio/ogg": ("audio", "ogg"),
    "audio/x-flac": ("audio", "flac"),
    "audio/flac": ("audio", "flac"),
    "audio/mp4": ("audio", "m4a"),
    "audio/x-m4a": ("audio", "m4a"),
    "audio/aac": ("audio", "aac"),
    "audio/webm": ("audio", "webm"),
}


class MediaError(ValueError):
    pass


@dataclass
class MediaInfo:
    kind: str
    mime: str
    ext: str
    width: int | None = None
    height: int | None = None
    duration: float | None = None
    fps: float | None = None
    has_audio: bool | None = None
    extra: dict = field(default_factory=dict)


def sniff(path: Path) -> tuple[str, str, str]:
    """Detect type from magic bytes (never trust the client-provided name/MIME)."""
    kind = filetype.guess(str(path))
    if kind is None:
        raise MediaError("Formato de archivo no reconocido")
    mime = kind.mime
    if mime == "video/mp4" or mime == "audio/mp4" or mime == "video/x-m4v":
        mime = "video/mp4"
    if mime not in ALLOWED_MIME:
        raise MediaError(f"Formato no permitido: {mime}")
    k, ext = ALLOWED_MIME[mime]
    return k, mime, ext


async def run_cmd(*args: str, timeout: float = 600) -> tuple[int, bytes, bytes]:
    proc = await asyncio.create_subprocess_exec(*args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except TimeoutError:
        proc.kill()
        raise
    return proc.returncode or 0, out, err


async def ffprobe(path: Path) -> dict:
    code, out, err = await run_cmd(
        get_settings().ffprobe_bin, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path), timeout=60
    )
    if code != 0:
        raise MediaError("No se pudo analizar el archivo multimedia: " + err.decode(errors="ignore")[-300:])
    return json.loads(out or b"{}")


def _parse_rate(rate: str | None) -> float | None:
    if not rate or rate in ("0/0",):
        return None
    try:
        if "/" in rate:
            a, b = rate.split("/")
            return round(float(a) / float(b), 3) if float(b) else None
        return float(rate)
    except ValueError:
        return None


async def inspect(path: Path) -> MediaInfo:
    kind, mime, ext = sniff(path)
    if kind == "image":
        def _img():
            with Image.open(path) as im:
                im.verify()
            with Image.open(path) as im:
                return im.size

        try:
            w, h = await asyncio.to_thread(_img)
        except Exception as e:  # noqa: BLE001
            raise MediaError(f"Imagen dañada o no válida: {e}") from e
        return MediaInfo(kind, mime, ext, width=w, height=h)

    data = await ffprobe(path)
    streams = data.get("streams", [])
    v = next((s for s in streams if s.get("codec_type") == "video"), None)
    a = next((s for s in streams if s.get("codec_type") == "audio"), None)
    duration = None
    try:
        duration = float(data.get("format", {}).get("duration"))
    except (TypeError, ValueError):
        pass
    if kind == "video":
        if v is None:
            if a is not None:  # e.g. audio-only mp4/webm
                kind, ext = "audio", ("m4a" if ext == "mp4" else ext)
                mime = "audio/mp4" if ext == "m4a" else "audio/webm"
                return MediaInfo(kind, mime, ext, duration=duration, has_audio=True)
            raise MediaError("El vídeo no contiene pistas de vídeo")
        return MediaInfo(
            kind, mime, ext,
            width=int(v.get("width") or 0) or None,
            height=int(v.get("height") or 0) or None,
            duration=duration,
            fps=_parse_rate(v.get("avg_frame_rate")) or _parse_rate(v.get("r_frame_rate")),
            has_audio=a is not None,
            extra={"vcodec": v.get("codec_name"), "acodec": a.get("codec_name") if a else None},
        )
    if a is None:
        raise MediaError("El audio no contiene pistas de audio")
    return MediaInfo(kind, mime, ext, duration=duration, has_audio=True, extra={"acodec": a.get("codec_name")})


async def make_thumbnail(path: Path, info: MediaInfo, dest: Path, max_side: int = 640) -> Path | None:
    try:
        if info.kind == "image":
            def _thumb():
                with Image.open(path) as im:
                    im = ImageOps.exif_transpose(im)
                    if getattr(im, "n_frames", 1) > 1:
                        im.seek(0)
                    im = im.convert("RGB")
                    im.thumbnail((max_side, max_side))
                    im.save(dest, "WEBP", quality=82)

            await asyncio.to_thread(_thumb)
            return dest
        if info.kind == "video":
            t = min(1.0, (info.duration or 0) / 3)
            code, _, err = await run_cmd(
                get_settings().ffmpeg_bin, "-y", "-v", "error", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1",
                "-vf", f"scale='min({max_side},iw)':-2", str(dest), timeout=120,
            )
            return dest if code == 0 and dest.exists() else None
        if info.kind == "audio":
            code, _, _ = await run_cmd(
                get_settings().ffmpeg_bin, "-y", "-v", "error", "-i", str(path), "-filter_complex",
                "showwavespic=s=640x160:colors=#ff5a36", "-frames:v", "1", str(dest), timeout=120,
            )
            return dest if code == 0 and dest.exists() else None
    except Exception:  # noqa: BLE001
        log.exception("thumbnail failed")
    return None


def guess_ext_from_mime(mime: str) -> str:
    if mime in ALLOWED_MIME:
        return ALLOWED_MIME[mime][1]
    ext = mimetypes.guess_extension(mime or "") or ".bin"
    return ext.lstrip(".")
