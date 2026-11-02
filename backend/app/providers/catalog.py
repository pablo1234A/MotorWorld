"""Model registry.

Each ``ModelSpec`` describes a logical model (what the user picks) and the
provider *routes* that can serve it. Adding a model = adding an entry here
(plus an input mapper in the provider module if its schema is new). The UI is
built entirely from this data: unsupported controls are never shown.

PRICES: approximate public list prices known at build time, *not* verified
live from this environment (provider APIs were unreachable). They are shown
as estimates and must be checked on the provider's pricing page.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

Task = Literal[
    "text_to_image", "image_to_image", "image_edit", "inpaint", "outpaint", "upscale_image", "remove_background",
    "text_to_video", "image_to_video", "first_last_to_video", "video_to_video", "upscale_video",
    "text_to_speech", "text_to_music", "text_to_sfx", "video_to_audio",
    "local_image_op", "local_video_op", "local_audio_op", "video_extend", "timeline_render", "film_develop",
    "edit_chain", "film_batch",
]

TASK_LABELS: dict[str, str] = {
    "text_to_image": "Texto a imagen",
    "image_to_image": "Imagen a imagen",
    "image_edit": "Edición por instrucciones",
    "inpaint": "Inpainting (relleno con máscara)",
    "outpaint": "Outpainting (extender)",
    "upscale_image": "Ampliación de imagen",
    "remove_background": "Eliminar fondo",
    "text_to_video": "Texto a vídeo",
    "image_to_video": "Imagen a vídeo",
    "first_last_to_video": "Primer y último fotograma",
    "video_to_video": "Vídeo a vídeo",
    "upscale_video": "Ampliación de vídeo",
    "text_to_speech": "Texto a voz",
    "text_to_music": "Generación de música",
    "text_to_sfx": "Efectos de sonido",
    "video_to_audio": "Audio sincronizado con vídeo",
    "local_image_op": "Operación local de imagen",
    "local_video_op": "Operación local de vídeo (FFmpeg)",
    "local_audio_op": "Operación local de audio (FFmpeg)",
    "video_extend": "Extensión de vídeo",
    "timeline_render": "Render de línea temporal",
    "film_develop": "Desarrollo de guion (LLM)",
    "edit_chain": "Cadena de edición",
    "film_batch": "Producción por lotes",
}


@dataclass
class ParamSpec:
    name: str
    label: str
    type: Literal["int", "float", "enum", "bool", "string", "seed"]
    default: Any = None
    min: float | None = None
    max: float | None = None
    step: float | None = None
    options: list[Any] | None = None
    help: str = ""
    advanced: bool = False


@dataclass
class Price:
    usd: float | None
    unit: Literal["image", "second", "megapixel", "run", "1k_chars", "video"]
    note: str = "Precio aproximado; verifícalo en la web del proveedor."


@dataclass
class Route:
    provider: str
    endpoints: dict[str, str]  # task -> endpoint/model path
    mapper: str  # input mapper key inside the provider module
    price: Price | None = None
    priority: int = 50  # lower = tried first
    options: dict[str, Any] = field(default_factory=dict)


@dataclass
class ModelSpec:
    id: str
    name: str
    family: str
    category: Literal["image", "video", "audio", "edit", "utility"]
    tasks: list[str]
    description: str
    license: str
    license_url: str = ""
    commercial_use: Literal["yes", "no", "depends"] = "depends"
    open_weights: bool = False
    params: list[ParamSpec] = field(default_factory=list)
    supports_negative_prompt: bool = False
    aspect_ratios: list[str] = field(default_factory=list)
    resolutions: list[str] = field(default_factory=list)
    durations: list[float] = field(default_factory=list)
    max_outputs: int = 1
    limitations: str = ""
    quality_tier: Literal["draft", "standard", "high", "top"] = "standard"
    routes: list[Route] = field(default_factory=list)
    local_only: bool = False
    tags: list[str] = field(default_factory=list)

    def to_public(self) -> dict[str, Any]:
        d = asdict(self)
        d["task_labels"] = {t: TASK_LABELS.get(t, t) for t in self.tasks}
        return d


# ---------------------------------------------------------------------------
# Reusable parameter definitions
# ---------------------------------------------------------------------------
def p_seed() -> ParamSpec:
    return ParamSpec("seed", "Semilla", "seed", None, 0, 2_147_483_647, help="Misma semilla + mismos ajustes = resultado reproducible (si el modelo lo garantiza).")


def p_num(max_n: int = 4) -> ParamSpec:
    return ParamSpec("num_outputs", "Número de imágenes", "int", 1, 1, max_n, 1)


def p_guidance(default: float, lo: float, hi: float) -> ParamSpec:
    return ParamSpec("guidance", "Guidance", "float", default, lo, hi, 0.1, help="Cuánto se ciñe al prompt.", advanced=True)


def p_steps(default: int, lo: int, hi: int) -> ParamSpec:
    return ParamSpec("steps", "Pasos de inferencia", "int", default, lo, hi, 1, advanced=True)


def p_strength(default: float = 0.75) -> ParamSpec:
    return ParamSpec("strength", "Intensidad de transformación", "float", default, 0.05, 1.0, 0.05, help="0 = conserva la imagen, 1 = la reinterpreta por completo.")


def p_format() -> ParamSpec:
    return ParamSpec("output_format", "Formato", "enum", "png", options=["png", "jpg", "webp"])


def p_aspect(options: list[str], default: str = "16:9") -> ParamSpec:
    return ParamSpec("aspect_ratio", "Relación de aspecto", "enum", default, options=options)


def p_duration(options: list[float], default: float) -> ParamSpec:
    return ParamSpec("duration", "Duración (s)", "enum", default, options=options)


def p_resolution(options: list[str], default: str) -> ParamSpec:
    return ParamSpec("resolution", "Resolución", "enum", default, options=options)


AR_IMG = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9", "4:5", "5:4"]
AR_VID = ["16:9", "9:16", "1:1"]

# ---------------------------------------------------------------------------
# IMAGE MODELS
# ---------------------------------------------------------------------------
MODELS: list[ModelSpec] = [
    ModelSpec(
        id="flux-schnell", name="FLUX.1 [schnell]", family="FLUX", category="image",
        tasks=["text_to_image"],
        description="Modelo rápido de Black Forest Labs (4 pasos). Pesos abiertos Apache-2.0: ideal para bocetos y exploración barata.",
        license="Apache-2.0", license_url="https://huggingface.co/black-forest-labs/FLUX.1-schnell",
        commercial_use="yes", open_weights=True, quality_tier="standard", max_outputs=4,
        params=[p_aspect(AR_IMG, "1:1"), p_num(4), p_seed(), p_format()],
        aspect_ratios=AR_IMG, limitations="Sin prompt negativo ni guidance (modelo destilado).",
        routes=[
            Route("huggingface", {"text_to_image": "black-forest-labs/FLUX.1-schnell"}, "hf_text_to_image",
                  Price(None, "image", "Consume los créditos mensuales incluidos de Hugging Face (cuenta gratuita: cantidad pequeña)."), priority=10),
            Route("replicate", {"text_to_image": "black-forest-labs/flux-schnell"}, "flux_schnell", Price(0.003, "image"), priority=20),
            Route("fal", {"text_to_image": "fal-ai/flux/schnell"}, "fal_flux", Price(0.003, "megapixel"), priority=30),
            Route("comfyui", {"text_to_image": "flux_schnell"}, "comfy_template", Price(0.0, "image", "Local: coste = tu hardware."), priority=5),
            Route("diffusers", {"text_to_image": "black-forest-labs/FLUX.1-schnell"}, "diffusers_flux", Price(0.0, "image", "Local (GPU)."), priority=6),
        ],
        tags=["free", "open-weights", "fast"],
    ),
    ModelSpec(
        id="flux-dev", name="FLUX.1 [dev]", family="FLUX", category="image",
        tasks=["text_to_image", "image_to_image"],
        description="Alta calidad con guidance configurable e imagen a imagen.",
        license="FLUX.1 [dev] Non-Commercial License (uso comercial de salidas vía proveedores con licencia)",
        license_url="https://huggingface.co/black-forest-labs/FLUX.1-dev/blob/main/LICENSE.md",
        commercial_use="depends", open_weights=True, quality_tier="high", max_outputs=4,
        params=[p_aspect(AR_IMG, "1:1"), p_num(4), p_guidance(3.5, 1, 10), p_steps(28, 10, 50), p_strength(0.8), p_seed(), p_format()],
        aspect_ratios=AR_IMG,
        limitations="Pesos con licencia no comercial: el uso comercial requiere acceder mediante un proveedor con licencia (Replicate/fal/BFL) o licencia de BFL.",
        routes=[
            Route("replicate", {"text_to_image": "black-forest-labs/flux-dev", "image_to_image": "black-forest-labs/flux-dev"}, "flux_dev", Price(0.025, "image"), priority=20),
            Route("fal", {"text_to_image": "fal-ai/flux/dev", "image_to_image": "fal-ai/flux/dev/image-to-image"}, "fal_flux", Price(0.025, "megapixel"), priority=30),
            Route("huggingface", {"text_to_image": "black-forest-labs/FLUX.1-dev"}, "hf_text_to_image", Price(None, "image", "Créditos HF."), priority=40),
            Route("bfl", {"text_to_image": "flux-dev"}, "bfl_generate", Price(0.025, "image"), priority=35),
        ],
        tags=["open-weights", "quality"],
    ),
    ModelSpec(
        id="flux-1.1-pro", name="FLUX 1.1 [pro]", family="FLUX", category="image",
        tasks=["text_to_image"],
        description="Modelo profesional de BFL: excelente adherencia al prompt y realismo.",
        license="Comercial vía API (términos del proveedor)", commercial_use="yes", quality_tier="top",
        params=[p_aspect(AR_IMG, "16:9"), p_seed(), p_format(),
                ParamSpec("prompt_upsampling", "Mejorar prompt automáticamente", "bool", False, advanced=True),
                ParamSpec("safety_tolerance", "Tolerancia de moderación", "int", 2, 1, 5, 1, advanced=True)],
        aspect_ratios=AR_IMG,
        routes=[
            Route("bfl", {"text_to_image": "flux-pro-1.1"}, "bfl_generate", Price(0.04, "image"), priority=20),
            Route("replicate", {"text_to_image": "black-forest-labs/flux-1.1-pro"}, "flux_pro", Price(0.04, "image"), priority=25),
            Route("fal", {"text_to_image": "fal-ai/flux-pro/v1.1"}, "fal_flux", Price(0.04, "megapixel"), priority=30),
        ],
        tags=["paid", "quality", "photoreal"],
    ),
    ModelSpec(
        id="flux-1.1-pro-ultra", name="FLUX 1.1 [pro] Ultra", family="FLUX", category="image",
        tasks=["text_to_image", "image_to_image"],
        description="Hasta 4 MP con modo raw para fotografía hiperrealista; admite imagen de referencia (image prompt).",
        license="Comercial vía API", commercial_use="yes", quality_tier="top",
        params=[p_aspect(AR_IMG, "16:9"), p_seed(), p_format(),
                ParamSpec("raw", "Modo RAW (fotografía natural)", "bool", True),
                ParamSpec("image_prompt_strength", "Peso de la referencia", "float", 0.1, 0, 1, 0.05, advanced=True)],
        aspect_ratios=AR_IMG,
        routes=[
            Route("bfl", {"text_to_image": "flux-pro-1.1-ultra", "image_to_image": "flux-pro-1.1-ultra"}, "bfl_generate", Price(0.06, "image"), priority=20),
            Route("replicate", {"text_to_image": "black-forest-labs/flux-1.1-pro-ultra", "image_to_image": "black-forest-labs/flux-1.1-pro-ultra"}, "flux_ultra", Price(0.06, "image"), priority=25),
            Route("fal", {"text_to_image": "fal-ai/flux-pro/v1.1-ultra", "image_to_image": "fal-ai/flux-pro/v1.1-ultra/redux"}, "fal_flux", Price(0.06, "image"), priority=30),
        ],
        tags=["paid", "top", "photoreal"],
    ),
    ModelSpec(
        id="qwen-image", name="Qwen-Image", family="Qwen", category="image",
        tasks=["text_to_image"],
        description="Modelo de pesos abiertos (Apache-2.0) muy bueno renderizando texto dentro de la imagen (carteles, anuncios).",
        license="Apache-2.0", license_url="https://huggingface.co/Qwen/Qwen-Image", commercial_use="yes", open_weights=True,
        quality_tier="high", supports_negative_prompt=True, max_outputs=4,
        params=[p_aspect(AR_IMG, "16:9"), p_num(4), p_guidance(4.0, 1, 10), p_steps(30, 10, 50), p_seed(), p_format()],
        aspect_ratios=AR_IMG,
        routes=[
            Route("fal", {"text_to_image": "fal-ai/qwen-image"}, "fal_qwen_image", Price(0.02, "megapixel"), priority=20),
            Route("replicate", {"text_to_image": "qwen/qwen-image"}, "replicate_qwen_image", Price(0.025, "image"), priority=30),
        ],
        tags=["open-weights", "typography", "ads"],
    ),
    ModelSpec(
        id="sdxl", name="Stable Diffusion XL", family="Stable Diffusion", category="image",
        tasks=["text_to_image"],
        description="Clásico de pesos abiertos (CreativeML Open RAIL++-M). Enorme ecosistema de LoRA y estilos.",
        license="CreativeML Open RAIL++-M", license_url="https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0",
        commercial_use="yes", open_weights=True, supports_negative_prompt=True, quality_tier="standard",
        params=[ParamSpec("width", "Ancho", "int", 1024, 512, 1536, 64), ParamSpec("height", "Alto", "int", 1024, 512, 1536, 64),
                p_guidance(7.0, 1, 15), p_steps(30, 10, 60), p_seed()],
        limitations="Menor calidad que FLUX en manos y texto.",
        routes=[
            Route("huggingface", {"text_to_image": "stabilityai/stable-diffusion-xl-base-1.0"}, "hf_text_to_image",
                  Price(None, "image", "Créditos HF incluidos."), priority=10),
            Route("comfyui", {"text_to_image": "sdxl"}, "comfy_template", Price(0.0, "image", "Local."), priority=5),
            Route("diffusers", {"text_to_image": "stabilityai/stable-diffusion-xl-base-1.0"}, "diffusers_sdxl", Price(0.0, "image", "Local (GPU)."), priority=6),
        ],
        tags=["free", "open-weights"],
    ),
    ModelSpec(
        id="imagen-4", name="Google Imagen 4", family="Imagen", category="image",
        tasks=["text_to_image"],
        description="Modelo de Google DeepMind con gran detalle y tipografía.",
        license="Comercial vía API", commercial_use="yes", quality_tier="top", supports_negative_prompt=True,
        params=[p_aspect(["1:1", "16:9", "9:16", "4:3", "3:4"], "16:9"), p_seed()],
        routes=[
            Route("fal", {"text_to_image": "fal-ai/imagen4/preview"}, "fal_imagen", Price(0.05, "image"), priority=20),
            Route("replicate", {"text_to_image": "google/imagen-4"}, "replicate_aspect_only", Price(0.04, "image"), priority=30),
        ],
        tags=["paid", "top"],
    ),
    ModelSpec(
        id="seedream-4", name="Seedream 4.0", family="Seedream", category="image",
        tasks=["text_to_image", "image_edit"],
        description="Modelo de ByteDance de alta resolución con edición multi-referencia.",
        license="Comercial vía API", commercial_use="yes", quality_tier="top",
        params=[p_aspect(["1:1", "16:9", "9:16", "4:3", "3:4"], "16:9"), p_seed()],
        routes=[
            Route("replicate", {"text_to_image": "bytedance/seedream-4", "image_edit": "bytedance/seedream-4"}, "replicate_seedream", Price(0.03, "image"), priority=20),
            Route("fal", {"text_to_image": "fal-ai/bytedance/seedream/v4/text-to-image", "image_edit": "fal-ai/bytedance/seedream/v4/edit"}, "fal_seedream", Price(0.03, "image"), priority=30),
        ],
        tags=["paid", "top", "reference"],
    ),
    # ---------------- EDITING ----------------
    ModelSpec(
        id="flux-kontext-pro", name="FLUX.1 Kontext [pro]", family="FLUX", category="edit",
        tasks=["image_edit", "text_to_image"],
        description="Edición por instrucciones en lenguaje natural que conserva identidad y objetos (ideal: 'cambia el fondo y conserva el producto').",
        license="Comercial vía API", commercial_use="yes", quality_tier="top",
        params=[p_aspect(["match_input_image"] + AR_IMG, "match_input_image"), p_seed(), p_format()],
        routes=[
            Route("bfl", {"image_edit": "flux-kontext-pro", "text_to_image": "flux-kontext-pro"}, "bfl_kontext", Price(0.04, "image"), priority=20),
            Route("replicate", {"image_edit": "black-forest-labs/flux-kontext-pro", "text_to_image": "black-forest-labs/flux-kontext-pro"}, "flux_kontext", Price(0.04, "image"), priority=25),
            Route("fal", {"image_edit": "fal-ai/flux-pro/kontext", "text_to_image": "fal-ai/flux-pro/kontext/text-to-image"}, "fal_kontext", Price(0.04, "image"), priority=30),
        ],
        tags=["paid", "edit", "consistency"],
    ),
    ModelSpec(
        id="flux-kontext-max", name="FLUX.1 Kontext [max]", family="FLUX", category="edit",
        tasks=["image_edit"],
        description="Versión máxima de Kontext: mejor tipografía y fidelidad en ediciones complejas.",
        license="Comercial vía API", commercial_use="yes", quality_tier="top",
        params=[p_aspect(["match_input_image"] + AR_IMG, "match_input_image"), p_seed(), p_format()],
        routes=[
            Route("bfl", {"image_edit": "flux-kontext-max"}, "bfl_kontext", Price(0.08, "image"), priority=20),
            Route("replicate", {"image_edit": "black-forest-labs/flux-kontext-max"}, "flux_kontext", Price(0.08, "image"), priority=25),
            Route("fal", {"image_edit": "fal-ai/flux-pro/kontext/max"}, "fal_kontext", Price(0.08, "image"), priority=30),
        ],
        tags=["paid", "edit", "top"],
    ),
    ModelSpec(
        id="qwen-image-edit", name="Qwen-Image-Edit", family="Qwen", category="edit",
        tasks=["image_edit"],
        description="Edición por instrucciones de pesos abiertos (Apache-2.0): semántica y de apariencia, incluido texto.",
        license="Apache-2.0", license_url="https://huggingface.co/Qwen/Qwen-Image-Edit", commercial_use="yes", open_weights=True,
        quality_tier="high", supports_negative_prompt=True,
        params=[p_guidance(4.0, 1, 10), p_steps(30, 10, 50), p_seed()],
        routes=[
            Route("fal", {"image_edit": "fal-ai/qwen-image-edit"}, "fal_qwen_edit", Price(0.03, "megapixel"), priority=20),
            Route("replicate", {"image_edit": "qwen/qwen-image-edit"}, "replicate_qwen_edit", Price(0.03, "image"), priority=30),
        ],
        tags=["open-weights", "edit"],
    ),
    ModelSpec(
        id="nano-banana", name="Gemini 2.5 Flash Image (nano-banana)", family="Gemini", category="edit",
        tasks=["image_edit", "text_to_image"],
        description="Modelo de Google para edición conversacional y composición con varias imágenes de referencia (personajes consistentes).",
        license="Comercial vía API", commercial_use="yes", quality_tier="top",
        params=[p_num(4)],
        routes=[
            Route("fal", {"image_edit": "fal-ai/nano-banana/edit", "text_to_image": "fal-ai/nano-banana"}, "fal_nano_banana", Price(0.039, "image"), priority=20),
            Route("replicate", {"image_edit": "google/nano-banana", "text_to_image": "google/nano-banana"}, "replicate_nano_banana", Price(0.039, "image"), priority=30),
        ],
        tags=["paid", "edit", "reference", "consistency"],
    ),
    ModelSpec(
        id="flux-fill-pro", name="FLUX.1 Fill [pro]", family="FLUX", category="edit",
        tasks=["inpaint", "outpaint"],
        description="Inpainting/outpainting con máscara: elimina, añade o sustituye elementos en zonas seleccionadas.",
        license="Comercial vía API", commercial_use="yes", quality_tier="top",
        params=[p_steps(50, 15, 50), p_guidance(30, 1.5, 100), p_seed(), p_format()],
        limitations="Requiere una máscara (blanco = zona a regenerar). Para outpainting, la plataforma amplía el lienzo y genera la máscara automáticamente.",
        routes=[
            Route("bfl", {"inpaint": "flux-pro-1.0-fill", "outpaint": "flux-pro-1.0-fill"}, "bfl_fill", Price(0.05, "image"), priority=20),
            Route("replicate", {"inpaint": "black-forest-labs/flux-fill-pro", "outpaint": "black-forest-labs/flux-fill-pro"}, "flux_fill", Price(0.05, "image"), priority=25),
            Route("fal", {"inpaint": "fal-ai/flux-pro/v1/fill", "outpaint": "fal-ai/flux-pro/v1/fill"}, "fal_fill", Price(0.05, "megapixel"), priority=30),
        ],
        tags=["paid", "edit", "mask"],
    ),
    ModelSpec(
        id="birefnet", name="BiRefNet (eliminar fondo)", family="BiRefNet", category="edit",
        tasks=["remove_background"],
        description="Segmentación de alta precisión para recortar sujetos y productos (PNG con transparencia).",
        license="MIT", license_url="https://github.com/ZhengPeng7/BiRefNet", commercial_use="yes", open_weights=True,
        routes=[Route("fal", {"remove_background": "fal-ai/birefnet"}, "fal_image_only", Price(None, "image", "Coste muy bajo por imagen; consulta fal."), priority=20)],
        tags=["open-weights", "edit"],
    ),
    ModelSpec(
        id="rembg-local", name="rembg (local, U²-Net)", family="rembg", category="edit",
        tasks=["remove_background"], local_only=True,
        description="Eliminación de fondo 100 % local y gratuita con onnxruntime. Requiere `pip install rembg` y descarga el modelo la primera vez.",
        license="MIT", license_url="https://github.com/danielgatis/rembg", commercial_use="yes", open_weights=True,
        routes=[Route("local", {"remove_background": "rembg"}, "local", Price(0.0, "image", "Local."), priority=5)],
        tags=["free", "local"],
    ),
    ModelSpec(
        id="clarity-upscaler", name="Clarity Upscaler", family="Upscalers", category="edit",
        tasks=["upscale_image"],
        description="Ampliación generativa con recuperación de detalle (x2/x4).",
        license="Comercial vía API", commercial_use="yes", quality_tier="high",
        params=[ParamSpec("scale", "Factor", "enum", 2, options=[2, 4]), ParamSpec("creativity", "Creatividad", "float", 0.35, 0, 1, 0.05, advanced=True), p_seed()],
        routes=[Route("fal", {"upscale_image": "fal-ai/clarity-upscaler"}, "fal_upscale", Price(None, "megapixel", "Consulta fal."), priority=20)],
        tags=["paid", "upscale"],
    ),
    ModelSpec(
        id="recraft-crisp-upscale", name="Recraft Crisp Upscale", family="Upscalers", category="edit",
        tasks=["upscale_image"],
        description="Ampliación nítida y fiel (no inventa detalles), buena para productos y caras.",
        license="Comercial vía API", commercial_use="yes",
        routes=[Route("replicate", {"upscale_image": "recraft-ai/recraft-crisp-upscale"}, "replicate_image_only", Price(0.004, "image"), priority=20)],
        tags=["paid", "upscale"],
    ),
    ModelSpec(
        id="lanczos-local", name="Ampliación clásica (Lanczos, local)", family="Local", category="utility",
        tasks=["upscale_image"], local_only=True,
        description="Reescalado matemático sin IA: no añade detalle, pero es instantáneo, gratuito y exacto.",
        license="N/A (Pillow, MIT-CMU)", commercial_use="yes",
        params=[ParamSpec("scale", "Factor", "enum", 2, options=[2, 3, 4])],
        routes=[Route("local", {"upscale_image": "lanczos"}, "local", Price(0.0, "image", "Local."), priority=5)],
        tags=["free", "local"],
    ),
]

# ---------------------------------------------------------------------------
# VIDEO MODELS
# ---------------------------------------------------------------------------
MODELS += [
    ModelSpec(
        id="wan-2.2", name="Wan 2.2 (A14B)", family="Wan", category="video",
        tasks=["text_to_video", "image_to_video"],
        description="Modelo de vídeo de pesos abiertos (Apache-2.0) de Alibaba con estética cinematográfica y buen movimiento.",
        license="Apache-2.0", license_url="https://github.com/Wan-Video/Wan2.2", commercial_use="yes", open_weights=True,
        quality_tier="high", supports_negative_prompt=True,
        params=[p_aspect(AR_VID, "16:9"), p_resolution(["480p", "720p"], "720p"), p_seed(),
                ParamSpec("num_frames", "Fotogramas", "int", 81, 81, 121, 4, help="81 fotogramas ≈ 5 s a 16 fps.", advanced=True)],
        aspect_ratios=AR_VID, resolutions=["480p", "720p"], durations=[5.0],
        limitations="Clips cortos (~5 s). La consistencia entre planos requiere imagen de referencia (image-to-video).",
        routes=[
            Route("replicate", {"text_to_video": "wan-video/wan-2.2-t2v-fast", "image_to_video": "wan-video/wan-2.2-i2v-fast"}, "replicate_wan", Price(None, "video", "Consulta Replicate."), priority=20),
            Route("fal", {"text_to_video": "fal-ai/wan/v2.2-a14b/text-to-video", "image_to_video": "fal-ai/wan/v2.2-a14b/image-to-video"}, "fal_wan", Price(0.08, "second"), priority=30),
            Route("diffusers", {"text_to_video": "Wan-AI/Wan2.2-TI2V-5B-Diffusers", "image_to_video": "Wan-AI/Wan2.2-TI2V-5B-Diffusers"}, "diffusers_wan", Price(0.0, "video", "Local, requiere GPU de ≥24 GB."), priority=60),
        ],
        tags=["open-weights", "cinematic"],
    ),
    ModelSpec(
        id="kling-2.1", name="Kling 2.1", family="Kling", category="video",
        tasks=["text_to_video", "image_to_video", "first_last_to_video"],
        description="Movimiento muy natural y física creíble. La variante Pro admite fotograma inicial y final.",
        license="Comercial vía API", commercial_use="yes", quality_tier="top", supports_negative_prompt=True,
        params=[p_duration([5, 10], 5), p_aspect(AR_VID, "16:9"),
                ParamSpec("cfg_scale", "Adherencia al prompt", "float", 0.5, 0, 1, 0.05, advanced=True)],
        aspect_ratios=AR_VID, durations=[5, 10], resolutions=["1080p"],
        routes=[
            Route("fal", {"text_to_video": "fal-ai/kling-video/v2.1/master/text-to-video",
                          "image_to_video": "fal-ai/kling-video/v2.1/master/image-to-video",
                          "first_last_to_video": "fal-ai/kling-video/v2.1/pro/image-to-video"}, "fal_kling", Price(0.28, "second", "Master ≈0,28 $/s; Pro ≈0,09 $/s (aprox.)."), priority=20),
            Route("replicate", {"text_to_video": "kwaivgi/kling-v2.1-master", "image_to_video": "kwaivgi/kling-v2.1",
                                "first_last_to_video": "kwaivgi/kling-v2.1"}, "replicate_kling", Price(None, "second", "Consulta Replicate."), priority=30),
        ],
        tags=["paid", "top", "first-last"],
    ),
    ModelSpec(
        id="veo-3", name="Google Veo 3", family="Veo", category="video",
        tasks=["text_to_video", "image_to_video"],
        description="Vídeo cinematográfico con audio nativo (diálogo, ambiente y efectos) generado junto a la imagen.",
        license="Comercial vía API", commercial_use="yes", quality_tier="top", supports_negative_prompt=True,
        params=[p_aspect(["16:9", "9:16"], "16:9"), ParamSpec("generate_audio", "Generar audio", "bool", True), p_seed()],
        durations=[8], resolutions=["720p", "1080p"],
        limitations="Coste elevado. Duración fija de ~8 s.",
        routes=[
            Route("fal", {"text_to_video": "fal-ai/veo3", "image_to_video": "fal-ai/veo3/image-to-video"}, "fal_veo", Price(0.75, "second", "≈0,50 $/s sin audio, 0,75 $/s con audio (aprox.)."), priority=20),
            Route("replicate", {"text_to_video": "google/veo-3", "image_to_video": "google/veo-3"}, "replicate_veo", Price(0.75, "second"), priority=30),
        ],
        tags=["paid", "top", "audio"],
    ),
    ModelSpec(
        id="hailuo-02", name="MiniMax Hailuo 02", family="Hailuo", category="video",
        tasks=["text_to_video", "image_to_video"],
        description="Excelente física y seguimiento de instrucciones de cámara; muy buena relación calidad/precio.",
        license="Comercial vía API", commercial_use="yes", quality_tier="high",
        params=[p_duration([6, 10], 6), ParamSpec("prompt_optimizer", "Optimizar prompt", "bool", True, advanced=True)],
        durations=[6, 10], resolutions=["768p"],
        routes=[
            Route("fal", {"text_to_video": "fal-ai/minimax/hailuo-02/standard/text-to-video", "image_to_video": "fal-ai/minimax/hailuo-02/standard/image-to-video"}, "fal_hailuo", Price(0.045, "second"), priority=20),
            Route("replicate", {"text_to_video": "minimax/hailuo-02", "image_to_video": "minimax/hailuo-02"}, "replicate_hailuo", Price(0.045, "second"), priority=30),
        ],
        tags=["paid", "camera"],
    ),
    ModelSpec(
        id="seedance-1-pro", name="Seedance 1.0 Pro", family="Seedance", category="video",
        tasks=["text_to_video", "image_to_video", "first_last_to_video"],
        description="Vídeo multi-plano coherente de ByteDance, hasta 1080p; admite fotograma final.",
        license="Comercial vía API", commercial_use="yes", quality_tier="top",
        params=[p_duration([5, 10], 5), p_resolution(["480p", "1080p"], "1080p"), p_aspect(["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"], "16:9"),
                ParamSpec("camera_fixed", "Cámara fija", "bool", False), p_seed()],
        routes=[
            Route("replicate", {"text_to_video": "bytedance/seedance-1-pro", "image_to_video": "bytedance/seedance-1-pro",
                                "first_last_to_video": "bytedance/seedance-1-pro"}, "replicate_seedance", Price(None, "second", "Depende de resolución; consulta Replicate."), priority=20),
        ],
        tags=["paid", "top", "multi-shot"],
    ),
    ModelSpec(
        id="ltx-video", name="LTX-Video 13B (distilled)", family="LTX", category="video",
        tasks=["text_to_video", "image_to_video"],
        description="Generación de vídeo muy rápida de Lightricks con pesos abiertos.",
        license="LTX-Video Open Weights License (gratuita bajo umbral de ingresos; ver licencia)",
        license_url="https://github.com/Lightricks/LTX-Video", commercial_use="depends", open_weights=True,
        quality_tier="standard", supports_negative_prompt=True,
        params=[p_aspect(AR_VID, "16:9"), p_resolution(["480p", "720p"], "720p"), p_seed()],
        routes=[
            Route("fal", {"text_to_video": "fal-ai/ltx-video-13b-distilled", "image_to_video": "fal-ai/ltx-video-13b-distilled/image-to-video"}, "fal_ltx", Price(None, "video", "Coste bajo; consulta fal."), priority=20),
            Route("diffusers", {"text_to_video": "Lightricks/LTX-Video", "image_to_video": "Lightricks/LTX-Video"}, "diffusers_ltx", Price(0.0, "video", "Local (GPU)."), priority=60),
        ],
        tags=["open-weights", "fast"],
    ),
    ModelSpec(
        id="hunyuan-video", name="HunyuanVideo", family="Hunyuan", category="video",
        tasks=["text_to_video"],
        description="Modelo de 13B de Tencent con gran calidad cinematográfica.",
        license="Tencent Hunyuan Community License (NO aplica en UE, Reino Unido ni Corea del Sur)",
        license_url="https://github.com/Tencent-Hunyuan/HunyuanVideo/blob/main/LICENSE.txt", commercial_use="depends", open_weights=True,
        quality_tier="high",
        params=[p_aspect(AR_VID, "16:9"), p_resolution(["480p", "580p", "720p"], "720p"), p_seed()],
        limitations="La licencia excluye expresamente el territorio de la UE: verifica tu caso antes de usarlo comercialmente.",
        routes=[Route("fal", {"text_to_video": "fal-ai/hunyuan-video"}, "fal_hunyuan", Price(0.4, "video"), priority=20)],
        tags=["open-weights", "license-restricted"],
    ),
    ModelSpec(
        id="cogvideox-5b", name="CogVideoX-5B", family="CogVideoX", category="video",
        tasks=["text_to_video", "video_to_video"],
        description="Modelo abierto de Zhipu/THUDM; admite vídeo a vídeo guiado por prompt.",
        license="CogVideoX License (5B); 2B en Apache-2.0", license_url="https://github.com/zai-org/CogVideo",
        commercial_use="depends", open_weights=True, supports_negative_prompt=True, quality_tier="draft",
        params=[p_guidance(7.0, 1, 15), p_steps(50, 10, 50), p_strength(0.8), p_seed()],
        routes=[
            Route("fal", {"text_to_video": "fal-ai/cogvideox-5b", "video_to_video": "fal-ai/cogvideox-5b/video-to-video"}, "fal_cogvideo", Price(0.2, "video"), priority=20),
            Route("diffusers", {"text_to_video": "THUDM/CogVideoX-5b"}, "diffusers_cogvideo", Price(0.0, "video", "Local (GPU)."), priority=60),
        ],
        tags=["open-weights", "v2v"],
    ),
    ModelSpec(
        id="luma-modify", name="Luma Ray2 Modify (vídeo a vídeo)", family="Luma", category="video",
        tasks=["video_to_video"],
        description="Reestiliza un vídeo existente conservando movimiento y composición (cambio de ambiente, época, estilo).",
        license="Comercial vía API", commercial_use="yes", quality_tier="top",
        params=[ParamSpec("mode", "Intensidad", "enum", "flex_1", options=["adhere_1", "adhere_2", "adhere_3", "flex_1", "flex_2", "flex_3", "reimagine_1", "reimagine_2", "reimagine_3"])],
        limitations="Vídeos de entrada cortos (máx. ~10 s).",
        routes=[Route("fal", {"video_to_video": "fal-ai/luma-dream-machine/ray-2/modify"}, "fal_luma_modify", Price(None, "second", "Consulta fal."), priority=20)],
        tags=["paid", "v2v"],
    ),
    ModelSpec(
        id="topaz-video-upscale", name="Ampliación de vídeo (Topaz)", family="Upscalers", category="video",
        tasks=["upscale_video"],
        description="Ampliación y mejora de vídeo profesional.",
        license="Comercial vía API", commercial_use="yes",
        params=[ParamSpec("target_resolution", "Resolución destino", "enum", "1080p", options=["720p", "1080p", "4k"])],
        routes=[Route("replicate", {"upscale_video": "topazlabs/video-upscale"}, "replicate_video_upscale", Price(None, "second", "Consulta Replicate."), priority=20)],
        tags=["paid", "upscale"],
    ),
]

# ---------------------------------------------------------------------------
# AUDIO MODELS
# ---------------------------------------------------------------------------
MODELS += [
    ModelSpec(
        id="elevenlabs-tts", name="ElevenLabs Multilingual v2", family="ElevenLabs", category="audio",
        tasks=["text_to_speech"],
        description="Voces sintéticas naturales en 29 idiomas (incluido español) para narración y diálogos.",
        license="Términos de ElevenLabs: el plan gratuito NO permite uso comercial y exige atribución.",
        license_url="https://elevenlabs.io/terms-of-use", commercial_use="depends",
        params=[ParamSpec("voice_id", "Voz", "string", "21m00Tcm4TlvDq8ikWAM", help="ID de voz de tu biblioteca de ElevenLabs."),
                ParamSpec("stability", "Estabilidad", "float", 0.5, 0, 1, 0.05, advanced=True),
                ParamSpec("similarity_boost", "Similitud", "float", 0.75, 0, 1, 0.05, advanced=True)],
        limitations="Solo voces de la biblioteca o propias con consentimiento. No se clonan voces de personas reales sin autorización.",
        routes=[Route("elevenlabs", {"text_to_speech": "eleven_multilingual_v2"}, "tts", Price(None, "1k_chars", "Plan gratuito: 10.000 créditos/mes (no comercial)."), priority=20)],
        tags=["voice"],
    ),
    ModelSpec(
        id="kokoro-tts", name="Kokoro 82M", family="Kokoro", category="audio",
        tasks=["text_to_speech"],
        description="TTS ligero de pesos abiertos (Apache-2.0).",
        license="Apache-2.0", license_url="https://huggingface.co/hexgrad/Kokoro-82M", commercial_use="yes", open_weights=True,
        params=[ParamSpec("voice", "Voz", "enum", "ef_dora", options=["ef_dora", "em_alex", "af_heart", "am_adam", "bf_emma", "bm_george"]),
                ParamSpec("speed", "Velocidad", "float", 1.0, 0.5, 2.0, 0.05)],
        routes=[Route("fal", {"text_to_speech": "fal-ai/kokoro/spanish"}, "fal_kokoro", Price(0.02, "1k_chars"), priority=20)],
        tags=["open-weights", "voice"],
    ),
    ModelSpec(
        id="elevenlabs-sfx", name="ElevenLabs Sound Effects", family="ElevenLabs", category="audio",
        tasks=["text_to_sfx"],
        description="Efectos de sonido y ambientes a partir de texto.",
        license="Términos de ElevenLabs (plan gratuito no comercial)", commercial_use="depends",
        params=[ParamSpec("duration", "Duración (s)", "float", 5, 0.5, 22, 0.5)],
        routes=[Route("elevenlabs", {"text_to_sfx": "sound-generation"}, "sfx", Price(None, "run", "Créditos ElevenLabs."), priority=20)],
        tags=["sfx"],
    ),
    ModelSpec(
        id="elevenlabs-music", name="ElevenLabs Music", family="ElevenLabs", category="audio",
        tasks=["text_to_music"],
        description="Música con licencia comercial en planes de pago.",
        license="Términos de ElevenLabs (requiere plan de pago para música)", commercial_use="depends",
        params=[ParamSpec("duration", "Duración (s)", "float", 30, 10, 300, 5)],
        routes=[Route("elevenlabs", {"text_to_music": "music"}, "music", Price(None, "run", "Requiere plan de pago de ElevenLabs."), priority=30)],
        tags=["music"],
    ),
    ModelSpec(
        id="stable-audio", name="Stable Audio Open", family="Stable Audio", category="audio",
        tasks=["text_to_music", "text_to_sfx"],
        description="Generación de música/ambientes/efectos de hasta 47 s con pesos abiertos.",
        license="Stability AI Community License (gratuita < 1 M$ de ingresos anuales)", license_url="https://huggingface.co/stabilityai/stable-audio-open-1.0",
        commercial_use="depends", open_weights=True,
        params=[ParamSpec("duration", "Duración (s)", "float", 20, 1, 47, 1), p_steps(100, 20, 200)],
        routes=[Route("fal", {"text_to_music": "fal-ai/stable-audio", "text_to_sfx": "fal-ai/stable-audio"}, "fal_stable_audio", Price(None, "run", "Consulta fal."), priority=20)],
        tags=["open-weights", "music", "sfx"],
    ),
    ModelSpec(
        id="musicgen", name="MusicGen (Meta AudioCraft)", family="AudioCraft", category="audio",
        tasks=["text_to_music"],
        description="Música instrumental desde texto. Los pesos son CC-BY-NC 4.0 (no comercial).",
        license="Código MIT; pesos CC-BY-NC-4.0 (NO comercial)", license_url="https://github.com/facebookresearch/audiocraft",
        commercial_use="no", open_weights=True,
        params=[ParamSpec("duration", "Duración (s)", "int", 15, 1, 30, 1)],
        routes=[Route("replicate", {"text_to_music": "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb"}, "replicate_musicgen", Price(None, "run", "Pago por tiempo de GPU en Replicate."), priority=30)],
        tags=["open-weights", "music", "non-commercial"],
    ),
    ModelSpec(
        id="mmaudio-v2", name="MMAudio v2 (vídeo a audio)", family="MMAudio", category="audio",
        tasks=["video_to_audio"],
        description="Genera efectos y ambiente sincronizados con lo que ocurre en un vídeo.",
        license="MIT (código); pesos CC-BY-NC 4.0 — revisar para uso comercial", license_url="https://github.com/hkchengrex/MMAudio",
        commercial_use="depends", open_weights=True, supports_negative_prompt=True,
        params=[ParamSpec("duration", "Duración (s)", "float", 8, 1, 30, 1), p_seed()],
        routes=[Route("fal", {"video_to_audio": "fal-ai/mmaudio-v2"}, "fal_mmaudio", Price(None, "second", "Consulta fal."), priority=20)],
        tags=["sync", "sfx"],
    ),
]

# ---------------------------------------------------------------------------
# LOCAL PROCESSING ENGINE (always available: FFmpeg + Pillow)
# ---------------------------------------------------------------------------
MODELS += [
    ModelSpec(
        id="local-image", name="Motor local de imagen (Pillow)", family="Local", category="utility",
        tasks=["local_image_op"], local_only=True,
        description="Recorte, rotación, color, brillo/contraste, nitidez, desenfoque, viñeta, extensión de lienzo y conversión de formato. Sin IA, sin coste.",
        license="Pillow (MIT-CMU)", commercial_use="yes",
        routes=[Route("local", {"local_image_op": "pillow"}, "local", Price(0.0, "image", "Local."), priority=1)],
        tags=["free", "local"],
    ),
    ModelSpec(
        id="local-ffmpeg", name="Motor local de vídeo (FFmpeg)", family="Local", category="utility",
        tasks=["local_video_op", "local_audio_op", "video_extend", "timeline_render"], local_only=True,
        description="Corte, velocidad, cámara lenta, interpolación de fotogramas, estabilización, color, subtítulos, recorte inteligente, mezcla, normalización y reducción de ruido.",
        license="FFmpeg (LGPL/GPL según compilación)", license_url="https://ffmpeg.org/legal.html", commercial_use="yes",
        routes=[Route("local", {"local_video_op": "ffmpeg", "local_audio_op": "ffmpeg", "video_extend": "ffmpeg", "timeline_render": "ffmpeg"}, "local", Price(0.0, "run", "Local."), priority=1)],
        tags=["free", "local"],
    ),
    ModelSpec(
        id="pipeline", name="Orquestador de pipelines", family="Local", category="utility",
        tasks=["edit_chain", "film_batch"],
        description="Ejecuta cadenas de pasos (edición por instrucciones, producción de películas) delegando cada paso en el modelo adecuado.",
        license="N/A", commercial_use="yes",
        routes=[Route("local", {"edit_chain": "pipeline", "film_batch": "pipeline"}, "local", Price(0.0, "run", "El coste es el de cada paso."), priority=1)],
        tags=["internal"],
    ),
    ModelSpec(
        id="llm", name="Asistente de guion (LLM)", family="LLM", category="utility",
        tasks=["film_develop"],
        description="Desarrolla argumento, escenas, diálogos y personajes. Usa Claude (Anthropic) o cualquier API compatible con OpenAI (Groq, OpenRouter, Ollama local, Hugging Face).",
        license="Términos de cada proveedor", commercial_use="depends",
        routes=[
            Route("anthropic", {"film_develop": "messages"}, "llm", Price(None, "run", "Pago por tokens."), priority=10),
            Route("openai_compat", {"film_develop": "chat"}, "llm", Price(None, "run", "Depende del servicio (Ollama local = gratis)."), priority=20),
        ],
        tags=["llm"],
    ),
]

_BY_ID = {m.id: m for m in MODELS}


def get_model(model_id: str) -> ModelSpec | None:
    return _BY_ID.get(model_id)


def models_for_task(task: str) -> list[ModelSpec]:
    return [m for m in MODELS if task in m.tasks]


def route_for(model: ModelSpec, provider: str) -> Route | None:
    return next((r for r in model.routes if r.provider == provider), None)


def estimate_cost(model: ModelSpec, route: Route, params: dict[str, Any]) -> tuple[float | None, str]:
    price = route.price
    if price is None or price.usd is None:
        return None, (price.note if price else "Coste no publicado")
    n = int(params.get("num_outputs") or 1)
    if price.unit in ("image", "run", "video"):
        return round(price.usd * n, 4), price.note
    if price.unit == "megapixel":
        mp = 1.0
        if params.get("width") and params.get("height"):
            mp = int(params["width"]) * int(params["height"]) / 1_000_000
        return round(price.usd * mp * n, 4), price.note
    if price.unit == "second":
        dur = float(params.get("duration") or (model.durations[0] if model.durations else 5))
        return round(price.usd * dur, 4), price.note
    if price.unit == "1k_chars":
        chars = int(params.get("_text_len") or 1000)
        return round(price.usd * max(1, chars / 1000), 4), price.note
    return None, price.note
