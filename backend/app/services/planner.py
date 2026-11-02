"""Natural-language edit planner.

Turns an instruction ("cambia el fondo por un estudio y amplía la imagen")
into an ordered list of executable steps, each labelled as *local*
(deterministic FFmpeg/Pillow) or *generative* (needs a provider model).

The rule-based parser always runs (offline, deterministic). If an LLM is
configured, it can refine the plan, but its output is constrained to the
same step vocabulary and validated — the LLM can never invent operations.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any

from ..providers.catalog import MODELS, get_model
from ..providers.registry import candidate_routes
from .llm import any_llm_configured, complete_json
from .prompting import COLOR_PRESETS_HINT

TIER = {"top": 0, "high": 1, "standard": 2, "draft": 3}


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s.lower())
    return "".join(c for c in s if not unicodedata.combining(c))


def best_model_for(task: str, creds: dict[str, str], prefer: str | None = None) -> str | None:
    if prefer:
        m = get_model(prefer)
        if m and task in m.tasks and candidate_routes(m, task, creds):
            return prefer
    options = [m for m in MODELS if task in m.tasks and "internal" not in m.tags and candidate_routes(m, task, creds)]
    options.sort(key=lambda m: (TIER.get(m.quality_tier, 2), 0 if m.local_only else 1))
    return options[0].id if options else None


def _has(t: str, *words: str) -> bool:
    return any(re.search(r"\b" + w, t) for w in words)


def _step(task: str, kind: str, label: str, creds: dict[str, str], *, prompt: str = "", params: dict | None = None,
          prefer: str | None = None) -> dict[str, Any]:
    model_id = "local-ffmpeg" if task in ("local_video_op", "local_audio_op", "video_extend") and kind == "local" else (
        "local-image" if task == "local_image_op" else best_model_for(task, creds, prefer))
    step = {"task": task, "kind": kind, "label": label, "prompt": prompt, "params": params or {}, "model_id": model_id,
            "available": model_id is not None}
    if model_id is None:
        needed = sorted({r.provider for m in MODELS if task in m.tasks for r in m.routes if task in r.endpoints})
        step["missing"] = f"Configura una API key de: {', '.join(needed)}"
    return step


def plan_image_edit(instruction: str, creds: dict[str, str], *, has_mask: bool = False) -> list[dict[str, Any]]:
    t = _norm(instruction)
    steps: list[dict[str, Any]] = []
    wants_bg_removal = _has(t, "quita el fondo", "elimina el fondo", "sin fondo", "fondo transparente", "remove background", "recorta el sujeto")
    wants_upscale = _has(t, "ampli", "upscale", "mayor resolucion", "4k", "mas resolucion", "aumenta la resolucion")
    wants_outpaint = _has(t, "extiend", "expand", "outpaint", "mas lienzo", "ensancha")
    wants_restore = _has(t, "restaur", "foto antigua", "arañazos", "restore")
    local_only = []
    if _has(t, "blanco y negro", "black and white", "escala de grises"):
        local_only.append({"op": "grayscale"})
    if _has(t, "sepia"):
        local_only.append({"op": "sepia"})
    if _has(t, "gira", "rota ", "rotar"):
        local_only.append({"op": "rotate", "degrees": 90})
    if _has(t, "voltea", "espejo", "mirror", "flip"):
        local_only.append({"op": "flip", "direction": "horizontal"})

    # Semantic content changes need a generative instruction-editing model.
    generative_words = ("cambia", "sustitu", "reemplaz", "añade", "anade", "agrega", "pon ", "convierte", "transforma", "mejora la iluminacion",
                        "iluminacion", "ropa", "vestido", "color de", "estilo", "fondo", "elimina", "borra", "quita", "publicitari",
                        "lujo", "change", "replace", "add ", "make it", "turn", "relight", "style", "retoca", "mejora el rostro", "cara")
    semantic = any(w in t for w in generative_words) and not (wants_bg_removal and not _has(t, "cambia el fondo", "nuevo fondo", "por un", "por una"))

    if wants_restore:
        steps.append(_step("image_edit", "generative", "Restaurar fotografía", creds,
                           prompt="Restore this old photograph: remove scratches, dust and noise, fix fading, keep the people and composition exactly the same. " + instruction))
    if has_mask and (semantic or _has(t, "elimina", "borra", "quita")):
        steps.append(_step("inpaint", "generative", "Editar la zona seleccionada (inpainting)", creds, prompt=instruction))
        semantic = False
    if wants_bg_removal and not semantic:
        steps.append(_step("remove_background", "generative", "Eliminar el fondo", creds))
    if semantic and not wants_restore:
        keep = " Keep the main subject, product, identity and proportions exactly unchanged." if _has(t, "conserva", "manten", "mismo", "igual", "keep") else ""
        steps.append(_step("image_edit", "generative", "Edición por instrucciones", creds, prompt=instruction + keep))
    if wants_outpaint:
        steps.append(_step("outpaint", "generative", "Extender la imagen (outpainting)", creds, prompt=instruction,
                           params={"extend": {"left": 256, "right": 256, "top": 0, "bottom": 0}}))
    if local_only:
        steps.append(_step("local_image_op", "local", "Ajustes locales", creds, params={"ops": local_only}))
    if wants_upscale:
        steps.append(_step("upscale_image", "generative", "Ampliar resolución", creds, params={"scale": 2}))
    if not steps:
        steps.append(_step("image_edit", "generative", "Edición por instrucciones", creds, prompt=instruction))
    return steps


def plan_video_edit(instruction: str, creds: dict[str, str], info: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    t = _norm(instruction)
    info = info or {}
    ops: list[dict[str, Any]] = []
    gen_steps: list[dict[str, Any]] = []
    m = re.search(r"(?:corta|recorta|trim)[^\d]*(\d+(?:[.,]\d+)?)\s*(?:s|seg)?[^\d]+(\d+(?:[.,]\d+)?)", t)
    if m:
        ops.append({"op": "trim", "start": float(m.group(1).replace(",", ".")), "end": float(m.group(2).replace(",", "."))})
    if _has(t, "camara lenta", "slow motion", "ralenti", "slowmo"):
        ops.append({"op": "slow_motion", "factor": 0.5})
    elif _has(t, "camara rapida", "acelera", "mas rapido", "timelapse", "fast motion"):
        ops.append({"op": "speed", "factor": 2.0})
    if _has(t, "estabiliz", "stabiliz", "quita el temblor"):
        ops.append({"op": "stabilize"})
    if _has(t, "interpol", "60 ?fps", "mas fluido", "fluidez"):
        ops.append({"op": "interpolate", "fps": 60})
    if _has(t, "vertical", "9:16", "reels", "tiktok", "shorts"):
        ops.append({"op": "reframe", "aspect": "9:16", "mode": "smart"})
    elif _has(t, "cuadrado", "1:1"):
        ops.append({"op": "reframe", "aspect": "1:1", "mode": "smart"})
    preset = None
    for key, words in COLOR_PRESETS_HINT.items():
        if any(w in t for w in words):
            preset = key
            break
    if preset:
        ops.append({"op": "color", "preset": preset})
    elif _has(t, "correccion de color", "corrige el color", "color grading", "mejora el color"):
        ops.append({"op": "color", "preset": "cinematic"})
    if _has(t, "mejora la iluminacion", "mas brillo", "ilumina"):
        ops.append({"op": "color", "brightness": 0.05, "contrast": 1.08})
    if _has(t, "cinemascope", "bandas negras", "letterbox", "panoramico"):
        ops.append({"op": "letterbox"})
    if _has(t, "grano", "film grain"):
        ops.append({"op": "grain", "amount": 10})
    if _has(t, "fundido", "fade"):
        ops.append({"op": "fade", "in": 0.8, "out": 0.8})
    if _has(t, "ruido de audio", "limpia el audio", "elimina el ruido"):
        ops.append({"op": "audio_denoise"})
    if _has(t, "normaliza", "volumen uniforme"):
        ops.append({"op": "normalize_audio"})
    if _has(t, "sin audio", "silencia", "quita el audio", "mute"):
        ops.append({"op": "mute"})
    if _has(t, "subtitul"):
        ops.append({"op": "subtitles", "cues": [], "_needs_cues": True})

    restyle_words = ("noche", "lluvi", "nieve", "atardecer", "cambia el ambiente", "estilo", "anime", "pixar", "acuarela", "cyberpunk",
                     "convierte", "transforma", "cambia el fondo", "sustituye el fondo", "anuncio", "comercial", "invierno", "verano",
                     "night", "rain", "restyle", "elimina el objeto", "borra", "quita el")
    if any(w in t for w in restyle_words):
        gen_steps.append(_step("video_to_video", "generative", "Transformación generativa (vídeo a vídeo)", creds, prompt=instruction))
    if _has(t, "movimiento de camara", "camara mas dinamica", "dinamic"):
        gen_steps.append({**_step("video_to_video", "generative", "Nuevo movimiento de cámara (regenerar a partir del vídeo)", creds,
                                  prompt=instruction + " Dynamic cinematic camera movement."), "note": "La mayoría de modelos v2v conservan el movimiento original; un cambio fuerte de cámara puede requerir regenerar el plano con imagen a vídeo."})
    if _has(t, "extiend", "alarga", "continua", "extend"):
        gen_steps.append(_step("video_extend", "generative", "Extender la escena desde el último fotograma", creds, prompt=instruction,
                               params={"i2v_model": best_model_for("image_to_video", creds)}))
        gen_steps[-1]["model_id"] = "local-ffmpeg"
        gen_steps[-1]["available"] = gen_steps[-1]["params"]["i2v_model"] is not None
    if _has(t, "4k", "mejora la resolucion", "upscale", "mas resolucion", "ampli"):
        model = best_model_for("upscale_video", creds)
        if model:
            gen_steps.append(_step("upscale_video", "generative", "Ampliar resolución con IA", creds))
        else:
            ops.append({"op": "scale", "height": 2160 if "4k" in t else 1080})
    if _has(t, "sonido", "efectos de sonido", "audio ambiente", "foley"):
        gen_steps.append(_step("video_to_audio", "generative", "Generar sonido sincronizado", creds, prompt=instruction))

    steps: list[dict[str, Any]] = list(gen_steps)
    if ops:
        steps.append({"task": "local_video_op", "kind": "local", "label": "Operaciones FFmpeg: " + ", ".join(o["op"] for o in ops),
                      "prompt": "", "params": {"ops": ops}, "model_id": "local-ffmpeg", "available": True})
    if not steps:
        steps.append(_step("video_to_video", "generative", "Transformación generativa (vídeo a vídeo)", creds, prompt=instruction))
    return steps


ALLOWED_IMAGE_TASKS = ["image_edit", "inpaint", "outpaint", "remove_background", "upscale_image", "local_image_op"]


async def refine_with_llm(instruction: str, steps: list[dict[str, Any]], creds: dict[str, str], media: str) -> list[dict[str, Any]]:
    """Ask an LLM to rewrite step prompts for clarity (English, model-friendly). Keeps the same tasks."""
    if not any_llm_configured(creds) or not any(s["kind"] == "generative" and s.get("prompt") for s in steps):
        return steps
    schema = {"type": "object", "properties": {"prompts": {"type": "array", "items": {"type": "string"}}}, "required": ["prompts"],
              "additionalProperties": False}
    gens = [s for s in steps if s["kind"] == "generative" and s.get("prompt")]
    system = ("Reescribes instrucciones de edición de " + ("imagen" if media == "image" else "vídeo") +
              " para modelos de IA: en inglés, concretas, una por paso, conservando todo lo que el usuario pidió conservar.")
    user = "Instrucción original: " + instruction + "\nPasos: " + "; ".join(s["label"] for s in gens)
    try:
        data, _ = await complete_json(system, user, schema, creds, effort="low")
        for s, p in zip(gens, data.get("prompts", [])):
            if isinstance(p, str) and p.strip():
                s["prompt"] = p.strip()
                s["refined"] = True
    except Exception:  # noqa: BLE001 - planning must still work without the LLM
        pass
    return steps
