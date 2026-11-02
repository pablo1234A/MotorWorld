"""fal.ai adapter (queue API) — https://docs.fal.ai/model-apis/model-endpoints/queue"""
from __future__ import annotations

from typing import Any, Callable

from .base import (
    InputFile, JobState, OutputItem, ProviderAdapter, ProviderError, ProviderInputError, ProviderRequest, Submission,
)
from .http import client, data_uri, raise_for_provider
from .util import collect_urls, compact, num

QUEUE = "https://queue.fal.run"
STORAGE_INITIATE = "https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3"
INLINE_LIMIT = 8 * 1024 * 1024

IMAGE_SIZE = {
    "1:1": "square_hd", "16:9": "landscape_16_9", "9:16": "portrait_16_9", "4:3": "landscape_4_3", "3:4": "portrait_4_3",
}


class FalAdapter(ProviderAdapter):
    id = "fal"
    name = "fal.ai"
    homepage = "https://fal.ai"
    docs_url = "https://docs.fal.ai"
    key_env = "FAL_KEY"
    signup_url = "https://fal.ai/dashboard/keys"
    free_tier = "Pago por uso. Las cuentas nuevas pueden recibir créditos promocionales puntuales; no hay nivel gratuito ilimitado."
    commercial_note = "Uso comercial según la licencia de cada modelo publicado en fal."

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Key {self.credential}", "Content-Type": "application/json"}

    async def _file_ref(self, f: InputFile) -> str:
        if f.url:
            return f.url
        size = f.path.stat().st_size
        if size <= INLINE_LIMIT:
            return data_uri(f.path, f.mime)
        async with client(600) as c:
            r = await c.post(STORAGE_INITIATE, headers=self._headers(), json={"content_type": f.mime, "file_name": f.path.name})
            raise_for_provider(r, "fal storage")
            info = r.json()
            up = await c.put(info["upload_url"], content=f.path.read_bytes(), headers={"Content-Type": f.mime})
            raise_for_provider(up, "fal storage")
        return info["file_url"]

    async def submit(self, req: ProviderRequest) -> Submission:
        mapper = MAPPERS.get(req.route_options.get("mapper", ""))
        if mapper is None:
            raise ProviderInputError(f"fal: mapper desconocido {req.route_options.get('mapper')}")
        refs: dict[str, Any] = {"_all_images": []}
        for f in req.inputs:
            ref = await self._file_ref(f)
            refs.setdefault(f.role, ref)
            if f.role in ("image", "reference"):
                refs["_all_images"].append(ref)
        payload = mapper(req, refs)
        async with client(120) as c:
            r = await c.post(f"{QUEUE}/{req.endpoint}", headers=self._headers(), json=payload)
        raise_for_provider(r, "fal")
        d = r.json()
        rid = d.get("request_id")
        if not rid:
            raise ProviderError("fal no devolvió request_id")
        return Submission(job_id=rid, meta={"status_url": d.get("status_url"), "response_url": d.get("response_url"),
                                            "cancel_url": d.get("cancel_url"), "endpoint": req.endpoint})

    async def poll(self, job_id: str, meta: dict[str, Any]) -> JobState:
        status_url = meta.get("status_url")
        response_url = meta.get("response_url")
        if not status_url or not response_url:
            raise ProviderError("fal: faltan URLs de seguimiento", retryable=False)
        async with client(60) as c:
            r = await c.get(status_url, headers=self._headers(), params={"logs": 1})
            raise_for_provider(r, "fal")
            s = r.json()
            st = s.get("status")
            if st == "IN_QUEUE":
                pos = s.get("queue_position")
                return JobState("queued", message=f"En cola en fal (posición {pos})" if pos is not None else "En cola en fal")
            if st == "IN_PROGRESS":
                return JobState("processing", message="Procesando en fal")
            if st != "COMPLETED":
                return JobState("processing", message=f"Estado fal: {st}")
            res = await c.get(response_url, headers=self._headers())
        if res.status_code >= 400:
            try:
                detail = res.json().get("detail")
            except Exception:  # noqa: BLE001
                detail = res.text[:500]
            return JobState("failed", error=f"fal: {detail}")
        body = res.json()
        urls = collect_urls(body)
        if not urls:
            return JobState("failed", error="fal no devolvió archivos de salida", raw=body)
        return JobState("completed", progress=1.0, outputs=[OutputItem(url=u) for u in urls],
                        raw={"seed": body.get("seed"), "has_nsfw_concepts": body.get("has_nsfw_concepts")})

    async def cancel(self, job_id: str, meta: dict[str, Any]) -> bool:
        url = meta.get("cancel_url")
        if not url:
            return False
        async with client(20) as c:
            r = await c.put(url, headers=self._headers())
        return r.is_success


# ---------------------------------------------------------------------------
P = ProviderRequest
Refs = dict[str, Any]


def _img_size(p: dict) -> Any:
    if p.get("width") and p.get("height"):
        return {"width": int(p["width"]), "height": int(p["height"])}
    return IMAGE_SIZE.get(str(p.get("aspect_ratio") or "1:1"), "landscape_16_9")


def _ofmt(p: dict) -> str | None:
    f = p.get("output_format")
    return {"jpg": "jpeg", "png": "png"}.get(f) if f else None


def fal_flux(r: P, f: Refs) -> dict:
    p = r.params
    ultra = "ultra" in r.endpoint
    d = {"prompt": r.prompt, "seed": num(p, "seed", int), "num_images": num(p, "num_outputs", int),
         "output_format": _ofmt(p), "enable_safety_checker": True}
    if ultra:
        d.update(aspect_ratio=p.get("aspect_ratio"), raw=p.get("raw"))
        if f.get("image"):
            d.update(image_url=f["image"], image_prompt_strength=num(p, "image_prompt_strength"))
    else:
        d.update(image_size=_img_size(p), guidance_scale=num(p, "guidance"), num_inference_steps=num(p, "steps", int))
        if f.get("image"):
            d.update(image_url=f["image"], strength=num(p, "strength"))
    return compact(d)


def fal_qwen_image(r: P, f: Refs) -> dict:
    p = r.params
    return compact({"prompt": r.prompt, "negative_prompt": r.negative_prompt, "image_size": _img_size(p),
                    "num_images": num(p, "num_outputs", int), "guidance_scale": num(p, "guidance"),
                    "num_inference_steps": num(p, "steps", int), "seed": num(p, "seed", int)})


def fal_imagen(r: P, f: Refs) -> dict:
    return compact({"prompt": r.prompt, "aspect_ratio": r.params.get("aspect_ratio"), "negative_prompt": r.negative_prompt,
                    "seed": num(r.params, "seed", int)})


def fal_seedream(r: P, f: Refs) -> dict:
    d = {"prompt": r.prompt, "image_size": _img_size(r.params)}
    if f.get("_all_images"):
        d["image_urls"] = f["_all_images"]
    return compact(d)


def fal_kontext(r: P, f: Refs) -> dict:
    p = r.params
    ar = p.get("aspect_ratio")
    return compact({"prompt": r.prompt, "image_url": f.get("image"), "aspect_ratio": None if ar == "match_input_image" else ar,
                    "seed": num(p, "seed", int), "output_format": _ofmt(p)})


def fal_qwen_edit(r: P, f: Refs) -> dict:
    p = r.params
    return compact({"prompt": r.prompt, "image_url": f.get("image"), "negative_prompt": r.negative_prompt,
                    "guidance_scale": num(p, "guidance"), "num_inference_steps": num(p, "steps", int), "seed": num(p, "seed", int)})


def fal_nano_banana(r: P, f: Refs) -> dict:
    d = {"prompt": r.prompt, "num_images": num(r.params, "num_outputs", int), "output_format": "png"}
    if f.get("_all_images"):
        d["image_urls"] = f["_all_images"]
    return compact(d)


def fal_fill(r: P, f: Refs) -> dict:
    p = r.params
    return compact({"prompt": r.prompt, "image_url": f.get("image"), "mask_url": f.get("mask"), "seed": num(p, "seed", int),
                    "output_format": _ofmt(p)})


def fal_image_only(r: P, f: Refs) -> dict:
    return {"image_url": f.get("image")}


def fal_upscale(r: P, f: Refs) -> dict:
    p = r.params
    return compact({"image_url": f.get("image"), "upscale_factor": num(p, "scale"), "creativity": num(p, "creativity"),
                    "seed": num(p, "seed", int), "prompt": r.prompt or None})


def fal_wan(r: P, f: Refs) -> dict:
    p = r.params
    return compact({"prompt": r.prompt, "negative_prompt": r.negative_prompt, "image_url": f.get("image"),
                    "aspect_ratio": None if f.get("image") else p.get("aspect_ratio"), "resolution": p.get("resolution"),
                    "num_frames": num(p, "num_frames", int), "seed": num(p, "seed", int)})


def fal_kling(r: P, f: Refs) -> dict:
    p = r.params
    dur = num(p, "duration", int)
    return compact({"prompt": r.prompt, "negative_prompt": r.negative_prompt, "image_url": f.get("image"),
                    "tail_image_url": f.get("end_image"), "duration": str(dur) if dur else None,
                    "aspect_ratio": None if f.get("image") else p.get("aspect_ratio"), "cfg_scale": num(p, "cfg_scale")})


def fal_veo(r: P, f: Refs) -> dict:
    p = r.params
    return compact({"prompt": r.prompt, "negative_prompt": r.negative_prompt, "image_url": f.get("image"),
                    "aspect_ratio": p.get("aspect_ratio"), "generate_audio": p.get("generate_audio"), "seed": num(p, "seed", int)})


def fal_hailuo(r: P, f: Refs) -> dict:
    p = r.params
    dur = num(p, "duration", int)
    return compact({"prompt": r.prompt, "image_url": f.get("image"), "duration": str(dur) if dur else None,
                    "prompt_optimizer": p.get("prompt_optimizer")})


def fal_ltx(r: P, f: Refs) -> dict:
    p = r.params
    return compact({"prompt": r.prompt, "negative_prompt": r.negative_prompt, "image_url": f.get("image"),
                    "aspect_ratio": p.get("aspect_ratio"), "resolution": p.get("resolution"), "seed": num(p, "seed", int)})


def fal_hunyuan(r: P, f: Refs) -> dict:
    p = r.params
    return compact({"prompt": r.prompt, "aspect_ratio": p.get("aspect_ratio"), "resolution": p.get("resolution"),
                    "seed": num(p, "seed", int)})


def fal_cogvideo(r: P, f: Refs) -> dict:
    p = r.params
    return compact({"prompt": r.prompt, "negative_prompt": r.negative_prompt, "video_url": f.get("video"),
                    "strength": num(p, "strength") if f.get("video") else None, "guidance_scale": num(p, "guidance"),
                    "num_inference_steps": num(p, "steps", int), "seed": num(p, "seed", int)})


def fal_luma_modify(r: P, f: Refs) -> dict:
    return compact({"prompt": r.prompt, "video_url": f.get("video"), "mode": r.params.get("mode")})


def fal_kokoro(r: P, f: Refs) -> dict:
    return compact({"prompt": r.prompt, "voice": r.params.get("voice"), "speed": num(r.params, "speed")})


def fal_stable_audio(r: P, f: Refs) -> dict:
    return compact({"prompt": r.prompt, "seconds_total": num(r.params, "duration", int), "steps": num(r.params, "steps", int)})


def fal_mmaudio(r: P, f: Refs) -> dict:
    p = r.params
    return compact({"prompt": r.prompt, "negative_prompt": r.negative_prompt, "video_url": f.get("video"),
                    "duration": num(p, "duration"), "seed": num(p, "seed", int)})


MAPPERS: dict[str, Callable[[P, Refs], dict]] = {
    fn.__name__: fn
    for fn in (
        fal_flux, fal_qwen_image, fal_imagen, fal_seedream, fal_kontext, fal_qwen_edit, fal_nano_banana, fal_fill,
        fal_image_only, fal_upscale, fal_wan, fal_kling, fal_veo, fal_hailuo, fal_ltx, fal_hunyuan, fal_cogvideo,
        fal_luma_modify, fal_kokoro, fal_stable_audio, fal_mmaudio,
    )
}
