"""Local open-weight inference with 🤗 Diffusers (GPU worker only).

Enabled with ``LOCAL_DIFFUSERS_ENABLED=true`` on a worker that has
``torch`` + ``diffusers`` installed (see backend/requirements-gpu.txt) and a
CUDA GPU. Pipelines are loaded lazily and cached per process. Weights are
downloaded from the Hugging Face Hub on first use (gated repos need HF_TOKEN).

NOTE: this path could not be exercised in the build environment (no GPU, Hub
blocked). It follows the documented Diffusers pipeline APIs.
"""
from __future__ import annotations

import asyncio
import importlib.util
import logging
import threading
from pathlib import Path
from typing import Any

from ..storage import tmp_path
from .base import JobState, OutputItem, ProviderAdapter, ProviderError, ProviderInputError, ProviderRequest, Submission
from .util import num, round32, wh_for

log = logging.getLogger(__name__)
_PIPES: dict[str, Any] = {}
_LOCK = threading.Lock()


def diffusers_available() -> tuple[bool, str]:
    if importlib.util.find_spec("torch") is None or importlib.util.find_spec("diffusers") is None:
        return False, "instala requirements-gpu.txt (torch + diffusers)"
    import torch  # type: ignore

    if not torch.cuda.is_available():
        return False, "no se detecta GPU CUDA"
    return True, f"GPU: {torch.cuda.get_device_name(0)}"


class DiffusersAdapter(ProviderAdapter):
    id = "diffusers"
    name = "Diffusers local (GPU)"
    kind = "local"
    homepage = "https://github.com/huggingface/diffusers"
    docs_url = "https://huggingface.co/docs/diffusers"
    key_env = None
    free_tier = "Gratis en tu hardware. Requiere GPU NVIDIA (12–24 GB+ de VRAM según el modelo)."
    commercial_note = "Según la licencia de cada modelo descargado."

    def __init__(self, credential: str | None, enabled: bool = False, device: str = "cuda", hf_token: str | None = None):
        super().__init__(credential)
        self.enabled = enabled
        self.device = device
        self.hf_token = hf_token

    def is_configured(self) -> bool:
        return self.enabled and diffusers_available()[0]

    async def health(self) -> tuple[bool, str]:
        if not self.enabled:
            return False, "desactivado (LOCAL_DIFFUSERS_ENABLED=false)"
        return diffusers_available()

    def _pipe(self, mapper: str, repo: str):
        key = f"{mapper}:{repo}"
        with _LOCK:
            if key in _PIPES:
                return _PIPES[key]
            import torch  # type: ignore
            import diffusers  # type: ignore

            dtype = torch.bfloat16
            cls = {
                "diffusers_flux": "FluxPipeline",
                "diffusers_sdxl": "StableDiffusionXLPipeline",
                "diffusers_wan": "WanPipeline",
                "diffusers_ltx": "LTXPipeline",
                "diffusers_cogvideo": "CogVideoXPipeline",
            }[mapper]
            if mapper == "diffusers_sdxl":
                dtype = torch.float16
            pipe = getattr(diffusers, cls).from_pretrained(repo, torch_dtype=dtype, token=self.hf_token)
            pipe.enable_model_cpu_offload() if hasattr(pipe, "enable_model_cpu_offload") else pipe.to(self.device)
            _PIPES[key] = pipe
            return pipe

    def _run(self, req: ProviderRequest) -> list[OutputItem]:
        import torch  # type: ignore

        mapper = req.route_options.get("mapper", "")
        p = req.params
        seed = num(p, "seed", int)
        gen = torch.Generator(device="cpu").manual_seed(seed) if seed is not None else None
        pipe = self._pipe(mapper, req.endpoint)
        w, h = wh_for(p)
        if mapper in ("diffusers_flux", "diffusers_sdxl"):
            kw: dict[str, Any] = {"prompt": req.prompt, "width": round32(w), "height": round32(h), "generator": gen,
                                  "num_images_per_prompt": num(p, "num_outputs", int) or 1}
            if mapper == "diffusers_flux":
                kw.update(num_inference_steps=4, guidance_scale=0.0, max_sequence_length=256)
            else:
                kw.update(negative_prompt=req.negative_prompt or None, num_inference_steps=num(p, "steps", int) or 30,
                          guidance_scale=num(p, "guidance") or 7.0)
            images = pipe(**kw).images
            outs = []
            for im in images:
                dest = tmp_path(".png")
                im.save(dest)
                outs.append(OutputItem(path=dest, mime="image/png", meta={"seed": seed}))
            return outs
        from diffusers.utils import export_to_video  # type: ignore

        if req.task == "image_to_video":
            raise ProviderInputError("Imagen a vídeo local aún no está conectado a Diffusers en esta versión; usa un proveedor cloud.")
        kw = {"prompt": req.prompt, "negative_prompt": req.negative_prompt or None, "generator": gen}
        if mapper == "diffusers_wan":
            kw.update(height=704, width=1280, num_frames=num(p, "num_frames", int) or 81, guidance_scale=5.0, num_inference_steps=40)
            fps = 24
        elif mapper == "diffusers_ltx":
            kw.update(height=480, width=704, num_frames=121, num_inference_steps=40)
            fps = 24
        else:
            kw.update(num_frames=49, num_inference_steps=num(p, "steps", int) or 50, guidance_scale=num(p, "guidance") or 6.0)
            fps = 8
        frames = pipe(**kw).frames[0]
        dest = tmp_path(".mp4")
        export_to_video(frames, str(dest), fps=fps)
        return [OutputItem(path=Path(dest), mime="video/mp4", meta={"seed": seed})]

    async def submit(self, req: ProviderRequest) -> Submission:
        if not self.is_configured():
            raise ProviderError("Diffusers local no disponible: " + diffusers_available()[1])
        outs = await asyncio.to_thread(self._run, req)
        return Submission(job_id=None, immediate=JobState("completed", progress=1.0, outputs=outs))
