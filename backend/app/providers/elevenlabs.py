"""ElevenLabs — https://elevenlabs.io/docs/api-reference"""
from __future__ import annotations

from .base import JobState, OutputItem, ProviderAdapter, ProviderInputError, ProviderRequest, Submission
from .http import client, raise_for_provider
from .util import compact, num

API = "https://api.elevenlabs.io/v1"


class ElevenLabsAdapter(ProviderAdapter):
    id = "elevenlabs"
    name = "ElevenLabs"
    homepage = "https://elevenlabs.io"
    docs_url = "https://elevenlabs.io/docs/api-reference"
    key_env = "ELEVENLABS_API_KEY"
    signup_url = "https://elevenlabs.io/app/settings/api-keys"
    free_tier = "Plan gratuito con ~10.000 créditos/mes (≈10 min de TTS). El plan gratuito NO incluye licencia comercial y exige atribución."
    commercial_note = "Uso comercial a partir del plan Starter (de pago)."

    def _h(self) -> dict[str, str]:
        return {"xi-api-key": self.credential or "", "Content-Type": "application/json"}

    async def health(self) -> tuple[bool, str]:
        if not self.credential:
            return False, "falta ELEVENLABS_API_KEY"
        try:
            async with client(10) as c:
                r = await c.get(f"{API}/user/subscription", headers=self._h())
            if r.status_code == 200:
                d = r.json()
                return True, f"plan {d.get('tier')}: {d.get('character_count')}/{d.get('character_limit')} créditos usados"
            return False, f"respuesta {r.status_code}"
        except Exception as e:  # noqa: BLE001
            return False, f"sin conexión: {type(e).__name__}"

    async def voices(self) -> list[dict]:
        async with client(20) as c:
            r = await c.get(f"{API}/voices", headers=self._h())
        raise_for_provider(r, "ElevenLabs")
        return [{"id": v["voice_id"], "name": v["name"], "category": v.get("category"), "labels": v.get("labels", {}),
                 "preview_url": v.get("preview_url")} for v in r.json().get("voices", [])]

    async def submit(self, req: ProviderRequest) -> Submission:
        mapper = req.route_options.get("mapper")
        p = req.params
        async with client(300) as c:
            if mapper == "tts":
                if not req.prompt.strip():
                    raise ProviderInputError("El texto está vacío")
                voice = p.get("voice_id") or "21m00Tcm4TlvDq8ikWAM"
                r = await c.post(
                    f"{API}/text-to-speech/{voice}", params={"output_format": "mp3_44100_128"}, headers=self._h(),
                    json={"text": req.prompt, "model_id": req.endpoint,
                          "voice_settings": compact({"stability": num(p, "stability"), "similarity_boost": num(p, "similarity_boost")})},
                )
            elif mapper == "sfx":
                r = await c.post(f"{API}/sound-generation", headers=self._h(),
                                 json=compact({"text": req.prompt, "duration_seconds": num(p, "duration")}))
            elif mapper == "music":
                dur = num(p, "duration") or 30
                r = await c.post(f"{API}/music", headers=self._h(), json={"prompt": req.prompt, "music_length_ms": int(dur * 1000)})
            else:
                raise ProviderInputError(f"ElevenLabs: operación desconocida {mapper}")
        raise_for_provider(r, "ElevenLabs")
        return Submission(job_id=None, immediate=JobState("completed", progress=1.0,
                                                          outputs=[OutputItem(data=r.content, mime="audio/mpeg")]))
