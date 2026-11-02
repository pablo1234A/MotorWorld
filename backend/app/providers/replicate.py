"""Replicate adapter — https://replicate.com/docs/reference/http

Official models are called via ``POST /v1/models/{owner}/{name}/predictions``;
community models pinned by version via ``POST /v1/predictions``.
"""
from __future__ import annotations

from typing import Any, Callable

from .base import (
    InputFile, JobState, OutputItem, ProviderAdapter, ProviderError, ProviderInputError, ProviderModerationError,
    ProviderRequest, Submission,
)
from .http import client, data_uri, raise_for_provider
from .util import collect_urls, compact, num, progress_from_logs

API = "https://api.replicate.com/v1"
SMALL_FILE = 256 * 1024


class ReplicateAdapter(ProviderAdapter):
    id = "replicate"
    name = "Replicate"
    homepage = "https://replicate.com"
    docs_url = "https://replicate.com/docs/reference/http"
    key_env = "REPLICATE_API_TOKEN"
    signup_url = "https://replicate.com/account/api-tokens"
    free_tier = "Sin nivel gratuito permanente: pago por uso (algunas cuentas nuevas reciben una pequeña prueba). Requiere método de pago para uso continuado."
    commercial_note = "Uso comercial permitido según la licencia de cada modelo."

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.credential}", "Content-Type": "application/json"}

    async def health(self) -> tuple[bool, str]:
        if not self.credential:
            return False, "falta REPLICATE_API_TOKEN"
        try:
            async with client(10) as c:
                r = await c.get(f"{API}/account", headers=self._headers())
            if r.status_code == 200:
                return True, f"conectado como {r.json().get('username', '?')}"
            return False, f"respuesta {r.status_code}"
        except Exception as e:  # noqa: BLE001
            return False, f"sin conexión: {type(e).__name__}"

    async def _file_ref(self, f: InputFile) -> str:
        if f.url:
            return f.url
        if f.path.stat().st_size <= SMALL_FILE:
            return data_uri(f.path, f.mime)
        async with client(300) as c:
            with f.path.open("rb") as fh:
                r = await c.post(
                    f"{API}/files",
                    headers={"Authorization": f"Bearer {self.credential}"},
                    files={"content": (f.path.name, fh, f.mime)},
                )
        raise_for_provider(r, "Replicate")
        return r.json()["urls"]["get"]

    async def submit(self, req: ProviderRequest) -> Submission:
        mapper = MAPPERS.get(req.route_options.get("mapper", ""))
        if mapper is None:
            raise ProviderInputError(f"Replicate: mapper desconocido {req.route_options.get('mapper')}")
        refs: dict[str, Any] = {"_all_images": []}
        for f in req.inputs:
            ref = await self._file_ref(f)
            refs.setdefault(f.role, ref)
            if f.role in ("image", "reference"):
                refs["_all_images"].append(ref)
        payload_input = mapper(req, refs)
        endpoint = req.endpoint
        async with client(60) as c:
            if ":" in endpoint:
                _, version = endpoint.split(":", 1)
                r = await c.post(f"{API}/predictions", headers=self._headers(), json={"version": version, "input": payload_input})
            else:
                r = await c.post(f"{API}/models/{endpoint}/predictions", headers=self._headers(), json={"input": payload_input})
        raise_for_provider(r, "Replicate")
        data = r.json()
        return Submission(job_id=data["id"], meta={"get": data.get("urls", {}).get("get"), "input": _redact(payload_input)})

    async def poll(self, job_id: str, meta: dict[str, Any]) -> JobState:
        async with client(30) as c:
            r = await c.get(f"{API}/predictions/{job_id}", headers=self._headers())
        raise_for_provider(r, "Replicate")
        d = r.json()
        st = d.get("status")
        if st in ("starting",):
            return JobState("queued", message="En cola en Replicate (arrancando modelo)")
        if st == "processing":
            return JobState("processing", progress=progress_from_logs(d.get("logs")), message="Procesando en Replicate")
        if st == "succeeded":
            urls = collect_urls(d.get("output"))
            if not urls:
                raise ProviderError("Replicate no devolvió archivos de salida", retryable=False)
            return JobState("completed", progress=1.0, outputs=[OutputItem(url=u) for u in urls], raw={"metrics": d.get("metrics")})
        if st == "canceled":
            return JobState("cancelled", message="Cancelado en Replicate")
        err = str(d.get("error") or "Error desconocido en Replicate")
        if "nsfw" in err.lower() or "safety" in err.lower():
            raise ProviderModerationError("Replicate: el contenido fue bloqueado por el filtro de seguridad")
        return JobState("failed", error=err)

    async def cancel(self, job_id: str, meta: dict[str, Any]) -> bool:
        async with client(20) as c:
            r = await c.post(f"{API}/predictions/{job_id}/cancel", headers=self._headers())
        return r.is_success


def _redact(d: dict[str, Any]) -> dict[str, Any]:
    return {k: (v[:60] + "…" if isinstance(v, str) and v.startswith("data:") else v) for k, v in d.items()}


# ---------------------------------------------------------------------------
# Input mappers: normalised request -> model input schema
# ---------------------------------------------------------------------------
P = ProviderRequest
Refs = dict[str, Any]


def _fmt(p: dict, allowed=("png", "jpg", "webp")) -> str | None:
    f = p.get("output_format")
    return f if f in allowed else None


def flux_schnell(r: P, f: Refs) -> dict:
    p = r.params
    return compact({"prompt": r.prompt, "aspect_ratio": p.get("aspect_ratio"), "num_outputs": num(p, "num_outputs", int),
                    "seed": num(p, "seed", int), "output_format": _fmt(p)})


def flux_dev(r: P, f: Refs) -> dict:
    p = r.params
    d = {"prompt": r.prompt, "aspect_ratio": p.get("aspect_ratio"), "num_outputs": num(p, "num_outputs", int),
         "guidance": num(p, "guidance"), "num_inference_steps": num(p, "steps", int), "seed": num(p, "seed", int),
         "output_format": _fmt(p)}
    if f.get("image"):
        d["image"] = f["image"]
        d["prompt_strength"] = num(p, "strength")
    return compact(d)


def flux_pro(r: P, f: Refs) -> dict:
    p = r.params
    return compact({"prompt": r.prompt, "aspect_ratio": p.get("aspect_ratio"), "seed": num(p, "seed", int),
                    "output_format": _fmt(p, ("png", "jpg", "webp")), "prompt_upsampling": p.get("prompt_upsampling"),
                    "safety_tolerance": num(p, "safety_tolerance", int)})


def flux_ultra(r: P, f: Refs) -> dict:
    p = r.params
    return compact({"prompt": r.prompt, "aspect_ratio": p.get("aspect_ratio"), "seed": num(p, "seed", int),
                    "output_format": _fmt(p, ("png", "jpg")), "raw": p.get("raw"), "image_prompt": f.get("image"),
                    "image_prompt_strength": num(p, "image_prompt_strength") if f.get("image") else None})


def flux_kontext(r: P, f: Refs) -> dict:
    p = r.params
    return compact({"prompt": r.prompt, "input_image": f.get("image"), "aspect_ratio": p.get("aspect_ratio"),
                    "seed": num(p, "seed", int), "output_format": _fmt(p, ("png", "jpg"))})


def flux_fill(r: P, f: Refs) -> dict:
    p = r.params
    return compact({"prompt": r.prompt, "image": f.get("image"), "mask": f.get("mask"), "steps": num(p, "steps", int),
                    "guidance": num(p, "guidance"), "seed": num(p, "seed", int), "output_format": _fmt(p, ("png", "jpg"))})


def replicate_qwen_image(r: P, f: Refs) -> dict:
    p = r.params
    return compact({"prompt": r.prompt, "negative_prompt": r.negative_prompt, "aspect_ratio": p.get("aspect_ratio"),
                    "num_inference_steps": num(p, "steps", int), "guidance": num(p, "guidance"), "seed": num(p, "seed", int)})


def replicate_aspect_only(r: P, f: Refs) -> dict:
    return compact({"prompt": r.prompt, "aspect_ratio": r.params.get("aspect_ratio"), "negative_prompt": r.negative_prompt})


def replicate_seedream(r: P, f: Refs) -> dict:
    d = {"prompt": r.prompt, "aspect_ratio": r.params.get("aspect_ratio")}
    if f.get("_all_images"):
        d["image_input"] = f["_all_images"]
        d["aspect_ratio"] = "match_input_image"
    return compact(d)


def replicate_qwen_edit(r: P, f: Refs) -> dict:
    return compact({"prompt": r.prompt, "image": f.get("image"), "seed": num(r.params, "seed", int)})


def replicate_nano_banana(r: P, f: Refs) -> dict:
    d = {"prompt": r.prompt, "output_format": "png"}
    if f.get("_all_images"):
        d["image_input"] = f["_all_images"]
    return compact(d)


def replicate_image_only(r: P, f: Refs) -> dict:
    return {"image": f.get("image")}


def replicate_wan(r: P, f: Refs) -> dict:
    p = r.params
    return compact({"prompt": r.prompt, "image": f.get("image"), "aspect_ratio": None if f.get("image") else p.get("aspect_ratio"),
                    "resolution": p.get("resolution"), "num_frames": num(p, "num_frames", int), "seed": num(p, "seed", int)})


def replicate_kling(r: P, f: Refs) -> dict:
    p = r.params
    d = {"prompt": r.prompt, "negative_prompt": r.negative_prompt, "duration": num(p, "duration", int),
         "start_image": f.get("image"), "aspect_ratio": None if f.get("image") else p.get("aspect_ratio")}
    if f.get("end_image"):
        d["end_image"] = f["end_image"]
        d["mode"] = "pro"
    return compact(d)


def replicate_veo(r: P, f: Refs) -> dict:
    return compact({"prompt": r.prompt, "image": f.get("image"), "negative_prompt": r.negative_prompt, "seed": num(r.params, "seed", int)})


def replicate_hailuo(r: P, f: Refs) -> dict:
    p = r.params
    return compact({"prompt": r.prompt, "first_frame_image": f.get("image"), "duration": num(p, "duration", int),
                    "prompt_optimizer": p.get("prompt_optimizer")})


def replicate_seedance(r: P, f: Refs) -> dict:
    p = r.params
    return compact({"prompt": r.prompt, "image": f.get("image"), "last_frame_image": f.get("end_image"),
                    "duration": num(p, "duration", int), "resolution": p.get("resolution"),
                    "aspect_ratio": None if f.get("image") else p.get("aspect_ratio"), "camera_fixed": p.get("camera_fixed"),
                    "seed": num(p, "seed", int)})


def replicate_video_upscale(r: P, f: Refs) -> dict:
    return compact({"video": f.get("video"), "target_resolution": r.params.get("target_resolution")})


def replicate_musicgen(r: P, f: Refs) -> dict:
    return compact({"prompt": r.prompt, "duration": num(r.params, "duration", int), "model_version": "stereo-large",
                    "output_format": "mp3", "normalization_strategy": "peak"})


MAPPERS: dict[str, Callable[[P, Refs], dict]] = {
    fn.__name__: fn
    for fn in (
        flux_schnell, flux_dev, flux_pro, flux_ultra, flux_kontext, flux_fill, replicate_qwen_image, replicate_aspect_only,
        replicate_seedream, replicate_qwen_edit, replicate_nano_banana, replicate_image_only, replicate_wan, replicate_kling,
        replicate_veo, replicate_hailuo, replicate_seedance, replicate_video_upscale, replicate_musicgen,
    )
}
