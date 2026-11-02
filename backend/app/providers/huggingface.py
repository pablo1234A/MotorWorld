"""Hugging Face Inference Providers (router) — https://huggingface.co/docs/inference-providers

Uses the ``hf-inference`` provider for text-to-image, which returns the image
bytes synchronously. Free accounts get a small monthly credit; PRO more.
"""
from __future__ import annotations

from typing import Any

from .base import JobState, OutputItem, ProviderAdapter, ProviderError, ProviderInputError, ProviderRequest, Submission
from .http import client, raise_for_provider
from .util import compact, num, round32, wh_for

ROUTER = "https://router.huggingface.co"


class HuggingFaceAdapter(ProviderAdapter):
    id = "huggingface"
    name = "Hugging Face Inference"
    homepage = "https://huggingface.co"
    docs_url = "https://huggingface.co/docs/inference-providers"
    key_env = "HF_TOKEN"
    signup_url = "https://huggingface.co/settings/tokens"
    free_tier = "Créditos mensuales incluidos: cuentas gratuitas reciben una cantidad pequeña (del orden de 0,10 $/mes), PRO más. Al agotarse, se bloquean o se cobran según tu configuración."
    commercial_note = "Depende de la licencia de cada modelo (p. ej. FLUX.1-schnell Apache-2.0 sí; FLUX.1-dev no comercial)."

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.credential}"}

    async def health(self) -> tuple[bool, str]:
        if not self.credential:
            return False, "falta HF_TOKEN"
        try:
            async with client(10) as c:
                r = await c.get("https://huggingface.co/api/whoami-v2", headers=self._headers())
            if r.status_code == 200:
                return True, f"conectado como {r.json().get('name', '?')}"
            return False, f"respuesta {r.status_code}"
        except Exception as e:  # noqa: BLE001
            return False, f"sin conexión: {type(e).__name__}"

    async def submit(self, req: ProviderRequest) -> Submission:
        if req.route_options.get("mapper") != "hf_text_to_image":
            raise ProviderInputError("Hugging Face: operación no soportada")
        p = req.params
        w, h = wh_for(p)
        n = int(p.get("num_outputs") or 1)
        outputs: list[OutputItem] = []
        async with client(300) as c:
            for i in range(n):
                seed = num(p, "seed", int)
                params = compact({
                    "negative_prompt": req.negative_prompt or None,
                    "guidance_scale": num(p, "guidance"),
                    "num_inference_steps": num(p, "steps", int),
                    "width": round32(w), "height": round32(h),
                    "seed": (seed + i) if seed is not None else None,
                })
                r = await c.post(f"{ROUTER}/hf-inference/models/{req.endpoint}", headers={**self._headers(), "Accept": "image/png"},
                                 json={"inputs": req.prompt, "parameters": params})
                if r.status_code == 503:
                    raise ProviderError("Hugging Face: el modelo se está cargando o no hay capacidad (503)")
                raise_for_provider(r, "Hugging Face")
                ctype = r.headers.get("content-type", "")
                if not ctype.startswith("image/"):
                    raise ProviderError(f"Hugging Face devolvió {ctype}: {r.text[:200]}")
                outputs.append(OutputItem(data=r.content, mime=ctype.split(";")[0], meta={"seed": params.get("seed")}))
        return Submission(job_id=None, immediate=JobState("completed", progress=1.0, outputs=outputs))

    async def poll(self, job_id: str, meta: dict[str, Any]) -> JobState:  # pragma: no cover
        raise ProviderError("HF es síncrono", retryable=False)
