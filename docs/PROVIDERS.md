# Proveedores, niveles gratuitos, licencias y API keys

> **Importante sobre la verificación.** El entorno donde se construyó el proyecto tenía la red restringida: los dominios de los proveedores (huggingface.co, api.replicate.com, fal.run, api.bfl.ai, api.elevenlabs.io, api.pexels.com…) devolvían bloqueo. La información de esta página procede de la documentación pública conocida en el momento de la construcción y **no pudo comprobarse en vivo**. Precios, créditos y límites cambian a menudo: **verifícalos en la web de cada proveedor antes de usarlos comercialmente.** El *Panel de proveedores* de la aplicación incluye una comprobación de conexión en vivo que usa endpoints de cuenta (sin coste).

## Resumen: qué necesitas para cada cosa

| Quiero… | Gratis | Con API key de pago |
|---|---|---|
| Editar, recortar, cámara lenta, color, subtítulos, mezcla, montaje y exportación | ✅ Motor local (FFmpeg + Pillow), incluido | — |
| Generar imágenes | ✅ ComfyUI o Diffusers en tu GPU · ✅ créditos mensuales pequeños de Hugging Face (FLUX.1-schnell, SDXL) | Replicate, fal, Black Forest Labs |
| Generar vídeo | ✅ Diffusers en GPU propia (Wan 2.2 TI2V-5B, LTX-Video, CogVideoX) — necesita ≥24 GB VRAM | fal, Replicate (Kling, Veo 3, Wan, Hailuo, Seedance, LTX, Hunyuan, Luma) |
| Editar imágenes por instrucciones | ❌ (no hay ruta local incluida) | BFL / Replicate / fal (FLUX Kontext, Qwen-Image-Edit, nano-banana, Seedream) |
| Eliminar fondos | ✅ rembg local (opcional, `pip install rembg`) | fal (BiRefNet) |
| Voces | ⚠️ ElevenLabs gratis = **no comercial** | ElevenLabs (planes de pago), fal (Kokoro) |
| Música / efectos | — | fal (Stable Audio, MMAudio), ElevenLabs, Replicate (MusicGen, **no comercial**) |
| Guion con IA | ✅ Ollama/LM Studio local · Groq/OpenRouter con niveles gratuitos limitados (vía OpenAI-compatible) | Anthropic Claude |
| Fotos y vídeos de stock | ✅ Pexels, Pixabay, Unsplash (claves gratuitas) | — |

## Proveedores de IA

| Proveedor | Variable | Nivel gratuito real | Uso comercial | Integración |
|---|---|---|---|---|
| **Hugging Face Inference Providers** | `HF_TOKEN` | Créditos mensuales incluidos: muy pequeños en cuentas gratuitas (del orden de 0,10 $/mes) y mayores en PRO. Al agotarse, se bloquea o se factura según tu configuración. | Depende de la licencia de cada modelo | `router.huggingface.co/hf-inference` (texto a imagen síncrono) |
| **Replicate** | `REPLICATE_API_TOKEN` | **No** hay nivel gratuito permanente; pago por uso (por imagen/segundo de GPU). | Según el modelo | API HTTP de predicciones (modelos oficiales y versiones fijadas), subida de archivos, cancelación |
| **fal.ai** | `FAL_KEY` | Pago por uso. Créditos promocionales puntuales para cuentas nuevas; **no** ilimitado. | Según el modelo | Queue API (submit/status/result/cancel), almacenamiento para archivos grandes |
| **Black Forest Labs** | `BFL_API_KEY` | Pago por créditos. | Sí (salidas de la API) | `api.bfl.ai/v1/*` + `polling_url` |
| **ElevenLabs** | `ELEVENLABS_API_KEY` | ~10.000 créditos/mes gratis, **sin licencia comercial** y con atribución. | Desde plan de pago | TTS, efectos de sonido, música; listado de voces |
| **Anthropic (Claude)** | `ANTHROPIC_API_KEY` | API de pago por tokens. Modelo por defecto `claude-opus-5-5`. | Sí | SDK oficial, salida JSON con esquema estricto y *fallback* por rechazo |
| **OpenAI-compatible** | `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_MODEL`, `OPENAI_COMPAT_API_KEY` | **Ollama / LM Studio**: gratis y local. **Groq**, **OpenRouter** (modelos `:free`), **Google Gemini** (endpoint compatible) tienen niveles gratuitos con límites de peticiones. | Según modelo | `POST /chat/completions` con `response_format=json_object` |
| **ComfyUI** (autoalojado) | `COMFYUI_URL` | Gratis (tu hardware). Código GPL-3.0: solo se usa su API HTTP. | Según el checkpoint | `/prompt`, `/history`, `/view`, `/upload/image`, `/interrupt`; plantillas SDXL y FLUX-schnell + workflows propios con marcadores |
| **Diffusers** (GPU propia) | `LOCAL_DIFFUSERS_ENABLED=true` | Gratis (tu hardware). Apache-2.0. | Según el modelo | Pipelines FLUX, SDXL, Wan, LTX, CogVideoX (perfil `gpu` de Compose) |

Ejemplo LLM local gratuito:

```env
OPENAI_COMPAT_BASE_URL=http://host.docker.internal:11434/v1
OPENAI_COMPAT_MODEL=qwen2.5:14b
```

## Recursos visuales gratuitos

| Servicio | Variable | Límites (documentados) | Licencia |
|---|---|---|---|
| **Pexels** | `PEXELS_API_KEY` | 200 peticiones/hora y 20.000/mes por defecto (ampliables gratis bajo solicitud). | Uso gratuito y comercial; se pide atribución en integraciones. |
| **Pixabay** | `PIXABAY_API_KEY` | 100 peticiones / 60 s; exige cachear 24 h y no enlazar imágenes en caliente de forma permanente (por eso se **importan** a tu almacenamiento). | Content License de Pixabay (uso comercial con restricciones). |
| **Unsplash** | `UNSPLASH_ACCESS_KEY` | Demo: 50 peticiones/hora; producción: 5.000/hora tras aprobación. Hay que **notificar cada descarga** (`download_location`, implementado) y atribuir al fotógrafo. | Licencia Unsplash. |

La aplicación guarda la atribución (autor, URL, texto) en los metadatos de cada archivo importado.

## Licencias de modelos (las que más afectan al uso comercial)

| Modelo | Licencia de los pesos | Nota |
|---|---|---|
| FLUX.1 [schnell] | Apache-2.0 | Libre, también comercial. |
| FLUX.1 [dev] | FLUX.1 [dev] Non-Commercial | Pesos no comerciales; vía proveedores con acuerdo (Replicate/fal/BFL) las salidas pueden usarse comercialmente según sus términos. |
| FLUX 1.1 pro / Kontext / Fill | Solo API | Comercial según términos de BFL / proveedor. |
| Stable Diffusion 1.x | CreativeML OpenRAIL-M | Comercial con restricciones de uso. |
| SDXL | CreativeML OpenRAIL++-M | Comercial con restricciones de uso. |
| Qwen-Image / Qwen-Image-Edit | Apache-2.0 | |
| Wan 2.2 | Apache-2.0 | |
| HunyuanVideo | Tencent Hunyuan Community License | **Excluye UE, Reino Unido y Corea del Sur.** Marcado en el catálogo. |
| LTX-Video | Licencia de pesos abiertos de Lightricks (gratuita bajo umbral de ingresos en versiones recientes) | Revisar la versión concreta. |
| CogVideoX | 2B: Apache-2.0 · 5B: CogVideoX License | Revisar para uso comercial. |
| MusicGen (AudioCraft) | Código MIT, **pesos CC-BY-NC 4.0** | **No comercial.** Marcado en el catálogo. |
| Stable Audio Open | Stability AI Community License | Gratuita por debajo de 1 M$ de ingresos anuales. |
| Kokoro-82M | Apache-2.0 | |
| MMAudio | Código MIT; pesos CC-BY-NC | Revisar. |
| Coqui TTS / XTTS-v2 | Código MPL-2.0; XTTS-v2 con Coqui Public Model License (no comercial). Coqui cerró en 2024; existe un fork comunitario. | **No integrado** por la licencia de XTTS. |
| RVC (conversión de voz) | MIT | **No integrado deliberadamente**: su uso típico es clonar voces; la plataforma no clona voces de personas reales sin consentimiento. |

## Software de terceros usado

FFmpeg (LGPL/GPL según compilación; se invoca como proceso), Pillow (MIT-CMU), OpenTimelineIO (Apache-2.0), FastAPI (MIT), SQLAlchemy (MIT), arq (MIT), Next.js (MIT), React (MIT), Tailwind (MIT), lucide (ISC), Geist (OFL), Instrument Serif (OFL). No se usa Remotion (su licencia exige licencia de empresa para organizaciones de más de 3 personas). No se ha copiado código ni marca de Higgsfield.

## Cómo añadir un proveedor o modelo

1. Modelo nuevo de un proveedor existente: añade un `ModelSpec` en `backend/app/providers/catalog.py` con sus `Route` y, si hace falta, un *mapper* en el adaptador. Ejecuta `python -m pytest tests/test_provider_contracts.py` y `python scripts/gen_models_doc.py`.
2. Proveedor nuevo: crea `providers/<nombre>.py` heredando de `ProviderAdapter` (`submit`, `poll`, `cancel`, `health`), regístralo en `registry.ADAPTERS` (y en `SERVER_KEYS`/`BYOK_PROVIDERS` si usa clave) y escribe sus pruebas de contrato con `respx`.
