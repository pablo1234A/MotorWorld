# Modelos integrados

_Generado automáticamente desde `backend/app/providers/catalog.py`. Precios aproximados (no verificados en vivo): compruébalos en la web de cada proveedor._

## Imagen

| Modelo | Operaciones | Proveedores (endpoint · precio) | Licencia | Comercial | Pesos abiertos |
|---|---|---|---|---|---|
| **FLUX.1 [schnell]** (`flux-schnell`) | Texto a imagen | **huggingface** `black-forest-labs/FLUX.1-schnell` · ver proveedor<br>**replicate** `black-forest-labs/flux-schnell` · ≈0.003 $/imagen<br>**fal** `fal-ai/flux/schnell` · ≈0.003 $/MP<br>**comfyui** `flux_schnell` · gratis (local)<br>**diffusers** `black-forest-labs/FLUX.1-schnell` · gratis (local) | Apache-2.0 | Sí | Sí |
| **FLUX.1 [dev]** (`flux-dev`) | Texto a imagen, Imagen a imagen | **replicate** `black-forest-labs/flux-dev` · ≈0.025 $/imagen<br>**fal** `fal-ai/flux/dev` · ≈0.025 $/MP<br>**huggingface** `black-forest-labs/FLUX.1-dev` · ver proveedor<br>**bfl** `flux-dev` · ≈0.025 $/imagen | FLUX.1 [dev] Non-Commercial License (uso comercial de salidas vía proveedores con licencia) | Revisar | Sí |
| **FLUX 1.1 [pro]** (`flux-1.1-pro`) | Texto a imagen | **bfl** `flux-pro-1.1` · ≈0.04 $/imagen<br>**replicate** `black-forest-labs/flux-1.1-pro` · ≈0.04 $/imagen<br>**fal** `fal-ai/flux-pro/v1.1` · ≈0.04 $/MP | Comercial vía API (términos del proveedor) | Sí | No |
| **FLUX 1.1 [pro] Ultra** (`flux-1.1-pro-ultra`) | Texto a imagen, Imagen a imagen | **bfl** `flux-pro-1.1-ultra` · ≈0.06 $/imagen<br>**replicate** `black-forest-labs/flux-1.1-pro-ultra` · ≈0.06 $/imagen<br>**fal** `fal-ai/flux-pro/v1.1-ultra` · ≈0.06 $/imagen | Comercial vía API | Sí | No |
| **Qwen-Image** (`qwen-image`) | Texto a imagen | **fal** `fal-ai/qwen-image` · ≈0.02 $/MP<br>**replicate** `qwen/qwen-image` · ≈0.025 $/imagen | Apache-2.0 | Sí | Sí |
| **Stable Diffusion XL** (`sdxl`) | Texto a imagen | **huggingface** `stabilityai/stable-diffusion-xl-base-1.0` · ver proveedor<br>**comfyui** `sdxl` · gratis (local)<br>**diffusers** `stabilityai/stable-diffusion-xl-base-1.0` · gratis (local) | CreativeML Open RAIL++-M | Sí | Sí |
| **Google Imagen 4** (`imagen-4`) | Texto a imagen | **fal** `fal-ai/imagen4/preview` · ≈0.05 $/imagen<br>**replicate** `google/imagen-4` · ≈0.04 $/imagen | Comercial vía API | Sí | No |
| **Seedream 4.0** (`seedream-4`) | Texto a imagen, Edición por instrucciones | **replicate** `bytedance/seedream-4` · ≈0.03 $/imagen<br>**fal** `fal-ai/bytedance/seedream/v4/text-to-image` · ≈0.03 $/imagen | Comercial vía API | Sí | No |

## Edición

| Modelo | Operaciones | Proveedores (endpoint · precio) | Licencia | Comercial | Pesos abiertos |
|---|---|---|---|---|---|
| **FLUX.1 Kontext [pro]** (`flux-kontext-pro`) | Edición por instrucciones, Texto a imagen | **bfl** `flux-kontext-pro` · ≈0.04 $/imagen<br>**replicate** `black-forest-labs/flux-kontext-pro` · ≈0.04 $/imagen<br>**fal** `fal-ai/flux-pro/kontext` · ≈0.04 $/imagen | Comercial vía API | Sí | No |
| **FLUX.1 Kontext [max]** (`flux-kontext-max`) | Edición por instrucciones | **bfl** `flux-kontext-max` · ≈0.08 $/imagen<br>**replicate** `black-forest-labs/flux-kontext-max` · ≈0.08 $/imagen<br>**fal** `fal-ai/flux-pro/kontext/max` · ≈0.08 $/imagen | Comercial vía API | Sí | No |
| **Qwen-Image-Edit** (`qwen-image-edit`) | Edición por instrucciones | **fal** `fal-ai/qwen-image-edit` · ≈0.03 $/MP<br>**replicate** `qwen/qwen-image-edit` · ≈0.03 $/imagen | Apache-2.0 | Sí | Sí |
| **Gemini 2.5 Flash Image (nano-banana)** (`nano-banana`) | Edición por instrucciones, Texto a imagen | **fal** `fal-ai/nano-banana/edit` · ≈0.039 $/imagen<br>**replicate** `google/nano-banana` · ≈0.039 $/imagen | Comercial vía API | Sí | No |
| **FLUX.1 Fill [pro]** (`flux-fill-pro`) | Inpainting (relleno con máscara), Outpainting (extender) | **bfl** `flux-pro-1.0-fill` · ≈0.05 $/imagen<br>**replicate** `black-forest-labs/flux-fill-pro` · ≈0.05 $/imagen<br>**fal** `fal-ai/flux-pro/v1/fill` · ≈0.05 $/MP | Comercial vía API | Sí | No |
| **BiRefNet (eliminar fondo)** (`birefnet`) | Eliminar fondo | **fal** `fal-ai/birefnet` · ver proveedor | MIT | Sí | Sí |
| **rembg (local, U²-Net)** (`rembg-local`) | Eliminar fondo | **local** `rembg` · gratis (local) | MIT | Sí | Sí |
| **Clarity Upscaler** (`clarity-upscaler`) | Ampliación de imagen | **fal** `fal-ai/clarity-upscaler` · ver proveedor | Comercial vía API | Sí | No |
| **Recraft Crisp Upscale** (`recraft-crisp-upscale`) | Ampliación de imagen | **replicate** `recraft-ai/recraft-crisp-upscale` · ≈0.004 $/imagen | Comercial vía API | Sí | No |

## Vídeo

| Modelo | Operaciones | Proveedores (endpoint · precio) | Licencia | Comercial | Pesos abiertos |
|---|---|---|---|---|---|
| **Wan 2.2 (A14B)** (`wan-2.2`) | Texto a vídeo, Imagen a vídeo | **replicate** `wan-video/wan-2.2-t2v-fast` · ver proveedor<br>**fal** `fal-ai/wan/v2.2-a14b/text-to-video` · ≈0.08 $/s<br>**diffusers** `Wan-AI/Wan2.2-TI2V-5B-Diffusers` · gratis (local) | Apache-2.0 | Sí | Sí |
| **Kling 2.1** (`kling-2.1`) | Texto a vídeo, Imagen a vídeo, Primer y último fotograma | **fal** `fal-ai/kling-video/v2.1/master/text-to-video` · ≈0.28 $/s<br>**replicate** `kwaivgi/kling-v2.1-master` · ver proveedor | Comercial vía API | Sí | No |
| **Google Veo 3** (`veo-3`) | Texto a vídeo, Imagen a vídeo | **fal** `fal-ai/veo3` · ≈0.75 $/s<br>**replicate** `google/veo-3` · ≈0.75 $/s | Comercial vía API | Sí | No |
| **MiniMax Hailuo 02** (`hailuo-02`) | Texto a vídeo, Imagen a vídeo | **fal** `fal-ai/minimax/hailuo-02/standard/text-to-video` · ≈0.045 $/s<br>**replicate** `minimax/hailuo-02` · ≈0.045 $/s | Comercial vía API | Sí | No |
| **Seedance 1.0 Pro** (`seedance-1-pro`) | Texto a vídeo, Imagen a vídeo, Primer y último fotograma | **replicate** `bytedance/seedance-1-pro` · ver proveedor | Comercial vía API | Sí | No |
| **LTX-Video 13B (distilled)** (`ltx-video`) | Texto a vídeo, Imagen a vídeo | **fal** `fal-ai/ltx-video-13b-distilled` · ver proveedor<br>**diffusers** `Lightricks/LTX-Video` · gratis (local) | LTX-Video Open Weights License (gratuita bajo umbral de ingresos; ver licencia) | Revisar | Sí |
| **HunyuanVideo** (`hunyuan-video`) | Texto a vídeo | **fal** `fal-ai/hunyuan-video` · ≈0.4 $/vídeo | Tencent Hunyuan Community License (NO aplica en UE, Reino Unido ni Corea del Sur) | Revisar | Sí |
| **CogVideoX-5B** (`cogvideox-5b`) | Texto a vídeo, Vídeo a vídeo | **fal** `fal-ai/cogvideox-5b` · ≈0.2 $/vídeo<br>**diffusers** `THUDM/CogVideoX-5b` · gratis (local) | CogVideoX License (5B); 2B en Apache-2.0 | Revisar | Sí |
| **Luma Ray2 Modify (vídeo a vídeo)** (`luma-modify`) | Vídeo a vídeo | **fal** `fal-ai/luma-dream-machine/ray-2/modify` · ver proveedor | Comercial vía API | Sí | No |
| **Ampliación de vídeo (Topaz)** (`topaz-video-upscale`) | Ampliación de vídeo | **replicate** `topazlabs/video-upscale` · ver proveedor | Comercial vía API | Sí | No |

## Audio

| Modelo | Operaciones | Proveedores (endpoint · precio) | Licencia | Comercial | Pesos abiertos |
|---|---|---|---|---|---|
| **ElevenLabs Multilingual v2** (`elevenlabs-tts`) | Texto a voz | **elevenlabs** `eleven_multilingual_v2` · ver proveedor | Términos de ElevenLabs: el plan gratuito NO permite uso comercial y exige atribución. | Revisar | No |
| **Kokoro 82M** (`kokoro-tts`) | Texto a voz | **fal** `fal-ai/kokoro/spanish` · ≈0.02 $/1k car. | Apache-2.0 | Sí | Sí |
| **ElevenLabs Sound Effects** (`elevenlabs-sfx`) | Efectos de sonido | **elevenlabs** `sound-generation` · ver proveedor | Términos de ElevenLabs (plan gratuito no comercial) | Revisar | No |
| **ElevenLabs Music** (`elevenlabs-music`) | Generación de música | **elevenlabs** `music` · ver proveedor | Términos de ElevenLabs (requiere plan de pago para música) | Revisar | No |
| **Stable Audio Open** (`stable-audio`) | Generación de música, Efectos de sonido | **fal** `fal-ai/stable-audio` · ver proveedor | Stability AI Community License (gratuita < 1 M$ de ingresos anuales) | Revisar | Sí |
| **MusicGen (Meta AudioCraft)** (`musicgen`) | Generación de música | **replicate** `meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb` · ver proveedor | Código MIT; pesos CC-BY-NC-4.0 (NO comercial) | No | Sí |
| **MMAudio v2 (vídeo a audio)** (`mmaudio-v2`) | Audio sincronizado con vídeo | **fal** `fal-ai/mmaudio-v2` · ver proveedor | MIT (código); pesos CC-BY-NC 4.0 — revisar para uso comercial | Revisar | Sí |

## Motores locales y utilidades

| Modelo | Operaciones | Proveedores (endpoint · precio) | Licencia | Comercial | Pesos abiertos |
|---|---|---|---|---|---|
| **Ampliación clásica (Lanczos, local)** (`lanczos-local`) | Ampliación de imagen | **local** `lanczos` · gratis (local) | N/A (Pillow, MIT-CMU) | Sí | No |
| **Motor local de imagen (Pillow)** (`local-image`) | Operación local de imagen | **local** `pillow` · gratis (local) | Pillow (MIT-CMU) | Sí | No |
| **Motor local de vídeo (FFmpeg)** (`local-ffmpeg`) | Operación local de vídeo (FFmpeg), Operación local de audio (FFmpeg), Extensión de vídeo, Render de línea temporal | **local** `ffmpeg` · gratis (local) | FFmpeg (LGPL/GPL según compilación) | Sí | No |
| **Orquestador de pipelines** (`pipeline`) | Cadena de edición, Producción por lotes, Secuencia multi-plano | **local** `pipeline` · gratis (local) | N/A | Sí | No |
| **Asistente de guion (LLM)** (`llm`) | Desarrollo de guion (LLM) | **anthropic** `messages` · ver proveedor<br>**openai_compat** `chat` · ver proveedor | Términos de cada proveedor | Revisar | No |
