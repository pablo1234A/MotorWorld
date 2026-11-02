"""Free stock media APIs (Pexels, Pixabay, Unsplash). Results include the
attribution each API's terms require; imports are downloaded into the user's
library with that attribution stored in the asset metadata."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from ..providers.registry import server_credential


@dataclass
class StockProvider:
    id: str
    name: str
    homepage: str
    docs_url: str
    key_env: str
    signup_url: str
    free_tier: str
    license_note: str
    media: tuple[str, ...]

    def key(self, user_creds: dict[str, str]) -> str | None:
        return user_creds.get(self.id) or server_credential(self.id)

    def status(self, user_creds: dict[str, str]) -> dict[str, Any]:
        return {
            "id": self.id, "name": self.name, "kind": "stock", "homepage": self.homepage, "docs_url": self.docs_url,
            "requires_key": True, "key_env": self.key_env, "signup_url": self.signup_url,
            "configured": bool(self.key(user_creds)),
            "key_source": "usuario" if self.id in user_creds else ("servidor" if server_credential(self.id) else None),
            "free_tier": self.free_tier, "commercial_note": self.license_note, "byok": True, "health": None, "models": [],
            "setup_hint": f"Solicita una clave gratuita en {self.signup_url} y defínela en {self.key_env}.",
        }


STOCK_PROVIDERS = {
    "pexels": StockProvider("pexels", "Pexels", "https://www.pexels.com", "https://www.pexels.com/api/documentation/", "PEXELS_API_KEY",
                            "https://www.pexels.com/api/new/", "API gratuita (por defecto 200 peticiones/hora y 20.000/mes).",
                            "Licencia Pexels: uso gratuito y comercial; atribución solicitada en la integración.", ("image", "video")),
    "pixabay": StockProvider("pixabay", "Pixabay", "https://pixabay.com", "https://pixabay.com/api/docs/", "PIXABAY_API_KEY",
                             "https://pixabay.com/accounts/register/", "API gratuita (100 peticiones/60 s). Debe cachear resultados 24 h y no enlazar en caliente.",
                             "Content License de Pixabay: uso gratuito y comercial con restricciones (no vender sin modificar).", ("image", "video")),
    "unsplash": StockProvider("unsplash", "Unsplash", "https://unsplash.com", "https://unsplash.com/documentation", "UNSPLASH_ACCESS_KEY",
                              "https://unsplash.com/oauth/applications", "Modo demo: 50 peticiones/hora; producción: 5.000/hora tras aprobación.",
                              "Licencia Unsplash: uso gratuito y comercial. La API exige atribuir al fotógrafo y notificar descargas.", ("image",)),
}


async def search(provider: str, query: str, media: str, user_creds: dict[str, str], page: int = 1) -> list[dict[str, Any]]:
    sp = STOCK_PROVIDERS.get(provider)
    if not sp:
        raise ValueError("Proveedor de stock desconocido")
    key = sp.key(user_creds)
    if not key:
        raise PermissionError(f"Falta {sp.key_env}")
    if media not in sp.media:
        raise ValueError(f"{sp.name} no ofrece {media}")
    async with httpx.AsyncClient(timeout=20, trust_env=True) as c:
        if provider == "pexels":
            url = "https://api.pexels.com/v1/search" if media == "image" else "https://api.pexels.com/videos/search"
            r = await c.get(url, headers={"Authorization": key}, params={"query": query, "per_page": 24, "page": page})
            r.raise_for_status()
            d = r.json()
            if media == "image":
                return [{"id": str(p["id"]), "thumb": p["src"]["medium"], "download": p["src"]["original"], "width": p["width"],
                         "height": p["height"], "author": p.get("photographer"), "author_url": p.get("photographer_url"),
                         "page_url": p.get("url"), "attribution": f"Foto de {p.get('photographer')} en Pexels"} for p in d.get("photos", [])]
            out = []
            for v in d.get("videos", []):
                files = sorted([f for f in v.get("video_files", []) if f.get("file_type") == "video/mp4"], key=lambda f: f.get("width") or 0)
                best = next((f for f in reversed(files) if (f.get("width") or 0) <= 1920), files[-1] if files else None)
                if best:
                    out.append({"id": str(v["id"]), "thumb": v.get("image"), "download": best["link"], "width": best.get("width"),
                                "height": best.get("height"), "duration": v.get("duration"), "author": (v.get("user") or {}).get("name"),
                                "page_url": v.get("url"), "attribution": f"Vídeo de {(v.get('user') or {}).get('name')} en Pexels"})
            return out
        if provider == "pixabay":
            url = "https://pixabay.com/api/" if media == "image" else "https://pixabay.com/api/videos/"
            r = await c.get(url, params={"key": key, "q": query, "per_page": 24, "page": page, "safesearch": "true"})
            r.raise_for_status()
            hits = r.json().get("hits", [])
            if media == "image":
                return [{"id": str(h["id"]), "thumb": h.get("webformatURL"), "download": h.get("largeImageURL"), "width": h.get("imageWidth"),
                         "height": h.get("imageHeight"), "author": h.get("user"), "page_url": h.get("pageURL"),
                         "attribution": f"Imagen de {h.get('user')} en Pixabay"} for h in hits]
            out = []
            for h in hits:
                vids = h.get("videos", {})
                best = vids.get("large") if vids.get("large", {}).get("url") else vids.get("medium", {})
                out.append({"id": str(h["id"]), "thumb": (vids.get("tiny") or {}).get("thumbnail") or best.get("thumbnail"), "download": best.get("url"),
                            "width": best.get("width"), "height": best.get("height"), "duration": h.get("duration"), "author": h.get("user"),
                            "page_url": h.get("pageURL"), "attribution": f"Vídeo de {h.get('user')} en Pixabay"})
            return out
        r = await c.get("https://api.unsplash.com/search/photos", headers={"Authorization": f"Client-ID {key}", "Accept-Version": "v1"},
                        params={"query": query, "per_page": 24, "page": page})
        r.raise_for_status()
        return [{"id": p["id"], "thumb": p["urls"]["small"], "download": p["urls"]["full"], "download_location": p["links"]["download_location"],
                 "width": p["width"], "height": p["height"], "author": p["user"]["name"], "author_url": p["user"]["links"]["html"],
                 "page_url": p["links"]["html"], "attribution": f"Foto de {p['user']['name']} en Unsplash"} for p in r.json().get("results", [])]


async def unsplash_track_download(download_location: str, user_creds: dict[str, str]) -> None:
    key = STOCK_PROVIDERS["unsplash"].key(user_creds)
    if key and download_location.startswith("https://api.unsplash.com/"):
        async with httpx.AsyncClient(timeout=10, trust_env=True) as c:
            await c.get(download_location, headers={"Authorization": f"Client-ID {key}"})


ALLOWED_DOWNLOAD_HOSTS = ("images.pexels.com", "videos.pexels.com", "player.vimeo.com", "pixabay.com", "cdn.pixabay.com",
                          "images.unsplash.com", "plus.unsplash.com")
