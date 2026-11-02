"""ComfyUI adapter (self-hosted, free) — https://github.com/Comfy-Org/ComfyUI

Talks to ComfyUI's HTTP API: ``POST /prompt`` (API-format workflow),
``GET /history/{id}``, ``GET /view``, ``POST /upload/image``, ``POST /interrupt``.

Built-in templates cover SDXL and FLUX.1-schnell (checkpoint names configurable
via route options / env). Users can also register their own API-format
workflows with ``{{prompt}}``, ``{{negative_prompt}}``, ``{{seed}}``,
``{{width}}``, ``{{height}}``, ``{{steps}}``, ``{{cfg}}``, ``{{image}}`` placeholders.
"""
from __future__ import annotations

import copy
import json
import os
import random
import uuid
from typing import Any
from urllib.parse import urlencode

from .base import JobState, OutputItem, ProviderAdapter, ProviderError, ProviderInputError, ProviderRequest, Submission
from .http import client, raise_for_provider
from .util import num, round32, wh_for


def _sdxl_like(ckpt: str, steps: int, cfg: float, sampler: str, scheduler: str) -> dict[str, Any]:
    return {
        "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": ckpt}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": "{{width}}", "height": "{{height}}", "batch_size": "{{batch}}"}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "{{prompt}}", "clip": ["4", 1]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "{{negative_prompt}}", "clip": ["4", 1]}},
        "3": {"class_type": "KSampler", "inputs": {
            "seed": "{{seed}}", "steps": "{{steps|%d}}" % steps, "cfg": "{{cfg|%s}}" % cfg, "sampler_name": sampler,
            "scheduler": scheduler, "denoise": 1.0, "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0],
            "latent_image": ["5", 0]}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "motorworld", "images": ["8", 0]}},
    }


TEMPLATES: dict[str, dict[str, Any]] = {
    "sdxl": _sdxl_like(os.getenv("COMFYUI_SDXL_CKPT", "sd_xl_base_1.0.safetensors"), 30, 7.0, "dpmpp_2m", "karras"),
    # FLUX schnell "all-in-one" fp8 checkpoint from the official ComfyUI examples.
    "flux_schnell": _sdxl_like(os.getenv("COMFYUI_FLUX_SCHNELL_CKPT", "flux1-schnell-fp8.safetensors"), 4, 1.0, "euler", "simple"),
}


def fill_template(wf: dict[str, Any], values: dict[str, Any]) -> dict[str, Any]:
    wf = copy.deepcopy(wf)

    def sub(v: Any) -> Any:
        if isinstance(v, str) and v.startswith("{{") and v.endswith("}}"):
            inner = v[2:-2]
            name, _, default = inner.partition("|")
            val = values.get(name)
            if val is None or val == "":
                if not default:
                    return "" if name in ("prompt", "negative_prompt") else v
                val = default
            if name in ("width", "height", "seed", "steps", "batch"):
                return int(float(val))
            if name in ("cfg", "denoise"):
                return float(val)
            return val
        if isinstance(v, str) and "{{prompt}}" in v:
            return v.replace("{{prompt}}", str(values.get("prompt", "")))
        if isinstance(v, dict):
            return {k: sub(x) for k, x in v.items()}
        if isinstance(v, list):
            return [sub(x) for x in v]
        return v

    out = sub(wf)
    unresolved = [k for k, n in out.items() if "{{" in json.dumps(n)]
    if unresolved:
        raise ProviderInputError(f"Plantilla ComfyUI con marcadores sin resolver en nodos {unresolved}")
    return out


class ComfyUIAdapter(ProviderAdapter):
    id = "comfyui"
    name = "ComfyUI (local / autoalojado)"
    kind = "local"
    homepage = "https://github.com/Comfy-Org/ComfyUI"
    docs_url = "https://docs.comfy.org"
    key_env = None
    free_tier = "Gratis: se ejecuta en tu propio hardware (GPU recomendada). Debes descargar los pesos del modelo."
    commercial_note = "Depende de la licencia de cada checkpoint que cargues."

    def __init__(self, credential: str | None, base_url: str | None = None):
        super().__init__(credential)
        self.base_url = (base_url or "").rstrip("/")

    def is_configured(self) -> bool:
        return bool(self.base_url)

    async def health(self) -> tuple[bool, str]:
        if not self.base_url:
            return False, "define COMFYUI_URL (p. ej. http://127.0.0.1:8188)"
        try:
            async with client(5) as c:
                r = await c.get(f"{self.base_url}/system_stats")
            if r.status_code == 200:
                dev = (r.json().get("devices") or [{}])[0]
                return True, f"activo ({dev.get('name', 'dispositivo desconocido')})"
            return False, f"respuesta {r.status_code}"
        except Exception as e:  # noqa: BLE001
            return False, f"no responde: {type(e).__name__}"

    async def _upload(self, path, mime) -> str:
        async with client(120) as c:
            with path.open("rb") as fh:
                r = await c.post(f"{self.base_url}/upload/image", files={"image": (path.name, fh, mime)}, data={"overwrite": "true"})
        raise_for_provider(r, "ComfyUI")
        d = r.json()
        return f"{d.get('subfolder') + '/' if d.get('subfolder') else ''}{d['name']}"

    async def submit(self, req: ProviderRequest) -> Submission:
        if not self.base_url:
            raise ProviderError("ComfyUI no configurado")
        wf = req.route_options.get("workflow") or TEMPLATES.get(req.endpoint)
        if wf is None:
            raise ProviderInputError(f"Plantilla ComfyUI desconocida: {req.endpoint}")
        p = req.params
        w, h = wh_for(p)
        values = {
            "prompt": req.prompt, "negative_prompt": req.negative_prompt,
            "seed": num(p, "seed", int) if p.get("seed") not in (None, "") else random.randint(0, 2**31 - 1),
            "width": round32(w) // 8 * 8, "height": round32(h) // 8 * 8, "steps": num(p, "steps", int),
            "cfg": num(p, "guidance"), "batch": num(p, "num_outputs", int) or 1, "denoise": num(p, "strength"),
        }
        img = req.input("image")
        if img:
            values["image"] = await self._upload(img.path, img.mime)
        workflow = fill_template(wf, values)
        client_id = uuid.uuid4().hex
        async with client(60) as c:
            r = await c.post(f"{self.base_url}/prompt", json={"prompt": workflow, "client_id": client_id})
        if r.status_code == 400:
            raise ProviderInputError(f"ComfyUI rechazó el workflow: {r.text[:500]}")
        raise_for_provider(r, "ComfyUI")
        return Submission(job_id=r.json()["prompt_id"], meta={"client_id": client_id, "seed": values["seed"]})

    async def poll(self, job_id: str, meta: dict[str, Any]) -> JobState:
        async with client(30) as c:
            r = await c.get(f"{self.base_url}/history/{job_id}")
            raise_for_provider(r, "ComfyUI")
            hist = r.json().get(job_id)
            if not hist:
                q = (await c.get(f"{self.base_url}/queue")).json()
                running = any(item[1] == job_id for item in q.get("queue_running", []))
                return JobState("processing" if running else "queued", message="Ejecutando en ComfyUI" if running else "En cola en ComfyUI")
        status = hist.get("status", {})
        if status.get("status_str") == "error":
            msgs = [m for m in status.get("messages", []) if m and m[0] == "execution_error"]
            detail = msgs[0][1].get("exception_message") if msgs else "error de ejecución"
            return JobState("failed", error=f"ComfyUI: {detail}")
        outputs: list[OutputItem] = []
        for node_out in hist.get("outputs", {}).values():
            for key in ("images", "gifs", "videos"):
                for item in node_out.get(key, []) or []:
                    if item.get("type") == "temp":
                        continue
                    q = urlencode({"filename": item["filename"], "subfolder": item.get("subfolder", ""), "type": item.get("type", "output")})
                    outputs.append(OutputItem(url=f"{self.base_url}/view?{q}", meta={"seed": meta.get("seed")}))
        if not outputs:
            return JobState("failed", error="ComfyUI terminó sin salidas (¿falta un nodo de guardado?)")
        return JobState("completed", progress=1.0, outputs=outputs)

    async def cancel(self, job_id: str, meta: dict[str, Any]) -> bool:
        async with client(10) as c:
            await c.post(f"{self.base_url}/queue", json={"delete": [job_id]})
            await c.post(f"{self.base_url}/interrupt")
        return True
