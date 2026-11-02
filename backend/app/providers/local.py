"""Local processing engine exposed as a provider (always available, zero cost)."""
from __future__ import annotations

import shutil

from ..services import ffmpeg_ops, image_ops
from .base import JobState, OutputItem, ProviderAdapter, ProviderError, ProviderInputError, ProviderRequest, Submission


class LocalAdapter(ProviderAdapter):
    id = "local"
    name = "Motor local (FFmpeg + Pillow)"
    kind = "local"
    homepage = "https://ffmpeg.org"
    key_env = None
    free_tier = "Gratis e ilimitado: se ejecuta en los workers de la plataforma."
    commercial_note = "Sin restricciones (herramientas de código abierto)."

    async def health(self) -> tuple[bool, str]:
        ok = shutil.which("ffmpeg") is not None
        extra = " · rembg instalado" if image_ops.rembg_available() else ""
        return ok, ("FFmpeg disponible" if ok else "FFmpeg no encontrado") + extra

    async def submit(self, req: ProviderRequest) -> Submission:
        p = req.params
        cb = req.route_options.get("progress_cb")
        img = req.input("image")
        vid = req.input("video")
        try:
            if req.task == "local_image_op":
                if not img:
                    raise ProviderInputError("Falta la imagen de entrada")
                out, fmt = image_ops.apply_ops(img.path, p.get("ops") or [])
                outs = [OutputItem(path=out)]
            elif req.task == "upscale_image" and req.endpoint == "lanczos":
                outs = [OutputItem(path=image_ops.upscale_lanczos(img.path, int(p.get("scale") or 2)))]
            elif req.task == "remove_background" and req.endpoint == "rembg":
                if not image_ops.rembg_available():
                    raise ProviderError("rembg no está instalado en este worker", retryable=True, code="not_configured")
                outs = [OutputItem(path=image_ops.remove_background_local(img.path))]
            elif req.task == "local_video_op":
                if not vid:
                    raise ProviderInputError("Falta el vídeo de entrada")
                ops = p.get("ops") or []
                if any(o.get("op") == "extract_frame" for o in ops):
                    at = next(o for o in ops if o.get("op") == "extract_frame").get("at", "last")
                    outs = [OutputItem(path=await ffmpeg_ops.extract_frame(vid.path, at))]
                elif any(o.get("op") == "extract_audio" for o in ops):
                    outs = [OutputItem(path=await ffmpeg_ops.extract_audio(vid.path))]
                else:
                    outs = [OutputItem(path=await ffmpeg_ops.apply_video_ops(vid.path, ops, cb))]
            elif req.task == "local_audio_op":
                audios = req.inputs_by_role("audio") or req.inputs_by_role("video")
                if not audios:
                    raise ProviderInputError("Falta el audio de entrada")
                if p.get("mix"):
                    vols = p.get("volumes") or []
                    delays = p.get("delays") or []
                    tracks = [{"path": a.path, "volume_db": vols[i] if i < len(vols) else 0, "delay": delays[i] if i < len(delays) else 0}
                              for i, a in enumerate(audios)]
                    outs = [OutputItem(path=await ffmpeg_ops.mix_tracks(tracks, cb))]
                else:
                    outs = [OutputItem(path=await ffmpeg_ops.apply_audio_ops(audios[0].path, p.get("ops") or [], cb))]
            else:
                raise ProviderInputError(f"El motor local no soporta {req.task}/{req.endpoint}")
        except ValueError as e:
            raise ProviderInputError(str(e)) from e
        except RuntimeError as e:
            raise ProviderError(str(e), retryable=False) from e
        return Submission(job_id=None, immediate=JobState("completed", progress=1.0, outputs=outs))
