"""Black Forest Labs API — https://docs.bfl.ai"""
from __future__ import annotations

from typing import Any

from .base import (
    JobState, OutputItem, ProviderAdapter, ProviderError, ProviderInputError, ProviderModerationError, ProviderRequest,
    Submission,
)
from .http import b64, client, raise_for_provider
from .util import compact, num, round32, wh_for

API = "https://api.bfl.ai/v1"


class BFLAdapter(ProviderAdapter):
    id = "bfl"
    name = "Black Forest Labs"
    homepage = "https://bfl.ai"
    docs_url = "https://docs.bfl.ai"
    key_env = "BFL_API_KEY"
    signup_url = "https://dashboard.bfl.ai"
    free_tier = "API de pago por créditos. No hay nivel gratuito permanente (consulta si ofrecen créditos de bienvenida)."
    commercial_note = "Las salidas de la API pueden usarse comercialmente según sus términos."

    def _headers(self) -> dict[str, str]:
        return {"x-key": self.credential or "", "accept": "application/json", "Content-Type": "application/json"}

    async def submit(self, req: ProviderRequest) -> Submission:
        mapper = req.route_options.get("mapper")
        p = req.params
        img = req.input("image")
        fmt = {"jpg": "jpeg", "png": "png"}.get(p.get("output_format") or "", None)
        if mapper == "bfl_generate":
            body: dict[str, Any] = {"prompt": req.prompt, "seed": num(p, "seed", int), "output_format": fmt,
                                    "safety_tolerance": num(p, "safety_tolerance", int)}
            if "ultra" in req.endpoint:
                body.update(aspect_ratio=p.get("aspect_ratio"), raw=p.get("raw"))
                if img:
                    body.update(image_prompt=b64(img.path), image_prompt_strength=num(p, "image_prompt_strength"))
            else:
                w, h = wh_for(p)
                body.update(width=round32(w), height=round32(h), prompt_upsampling=p.get("prompt_upsampling"))
                if req.endpoint == "flux-dev":
                    body.update(steps=num(p, "steps", int), guidance=num(p, "guidance"))
        elif mapper == "bfl_kontext":
            ar = p.get("aspect_ratio")
            body = {"prompt": req.prompt, "input_image": b64(img.path) if img else None,
                    "aspect_ratio": None if ar == "match_input_image" else ar, "seed": num(p, "seed", int), "output_format": fmt}
        elif mapper == "bfl_fill":
            mask = req.input("mask")
            if not img or not mask:
                raise ProviderInputError("FLUX Fill requiere imagen y máscara")
            body = {"prompt": req.prompt, "image": b64(img.path), "mask": b64(mask.path), "steps": num(p, "steps", int),
                    "guidance": num(p, "guidance"), "seed": num(p, "seed", int), "output_format": fmt}
        else:
            raise ProviderInputError(f"BFL: mapper desconocido {mapper}")
        async with client(120) as c:
            r = await c.post(f"{API}/{req.endpoint}", headers=self._headers(), json=compact(body))
        raise_for_provider(r, "BFL")
        d = r.json()
        return Submission(job_id=d["id"], meta={"polling_url": d.get("polling_url") or f"{API}/get_result?id={d['id']}"})

    async def poll(self, job_id: str, meta: dict[str, Any]) -> JobState:
        async with client(30) as c:
            r = await c.get(meta["polling_url"], headers=self._headers())
        raise_for_provider(r, "BFL")
        d = r.json()
        st = d.get("status")
        if st == "Ready":
            sample = (d.get("result") or {}).get("sample")
            if not sample:
                return JobState("failed", error="BFL no devolvió imagen")
            return JobState("completed", progress=1.0, outputs=[OutputItem(url=sample)], raw={"seed": (d.get("result") or {}).get("seed")})
        if st in ("Pending", "Queued"):
            prog = d.get("progress")
            return JobState("processing", progress=(float(prog) / 100 if isinstance(prog, (int, float)) and prog > 1 else prog),
                            message="Procesando en BFL")
        if st in ("Content Moderated", "Request Moderated"):
            raise ProviderModerationError("BFL bloqueó el contenido por moderación")
        if st == "Task not found":
            raise ProviderError("BFL: tarea no encontrada (caducada)", retryable=False)
        return JobState("failed", error=f"BFL: {st} {d.get('details') or ''}")
