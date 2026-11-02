# Estado del proyecto: terminado, pendiente y limitaciones

Registro de trabajo por fases (las 11 fases del encargo).

| Fase | Estado |
|---|---|
| 1. Análisis de referencias, modelos y proveedores | ✅ (ver PROVIDERS.md; sin verificación en vivo por red bloqueada) |
| 2. Arquitectura | ✅ ARCHITECTURE.md |
| 3. Interfaz y componentes | ✅ 14 secciones + autenticación + legal, responsive |
| 4. Backend y base de datos | ✅ FastAPI, PostgreSQL/SQLite, Alembic |
| 5. Sistema de proveedores y modelos | ✅ 9 adaptadores + motor local, 38 modelos, fallback |
| 6. Generadores de imagen y vídeo | ✅ (ejecución real pendiente de API keys) |
| 7. Editores de imagen y vídeo | ✅ |
| 8. Estudio cinematográfico | ✅ |
| 9. Audio, biblioteca, proyectos, historial | ✅ |
| 10. Pruebas y corrección de errores | ✅ 54 + 36 + 10 pruebas |
| 11. Preparación del despliegue | ✅ Docker Compose, Caddy, backups, CI (no publicado) |

## Funciones terminadas y verificadas de verdad

- Registro, login, logout, refresco rotativo, recuperación de contraseña, perfil, preferencias, sesiones, borrado de cuenta.
- Biblioteca privada con validación de archivos, miniaturas, favoritos, proyectos, descargas, cuotas.
- Sistema central de trabajos: estados, progreso real, cancelar, reintentar, duplicar, guardar, eliminar, coste estimado, intentos, fallback, límites, recuperación de trabajos huérfanos, colas independientes.
- Motor local: todas las operaciones de imagen (Pillow) y vídeo/audio (FFmpeg) listadas en la UI, edición por segmentos, extracción de fotogramas y audio.
- Línea temporal multipista con render FFmpeg, transiciones, superposiciones, mezcla, subtítulos y exportación OTIO/SRT.
- Editor de imágenes: plan → ejecución, máscaras, antes/después, historial, deshacer/rehacer, retoque local.
- Editor de vídeo: plan que separa FFmpeg/generativo, herramientas manuales, subtítulos.
- Estudio de películas: guion (LLM), edición manual completa, personajes con referencias, storyboard, producción por lotes, montaje automático, render.
- Pipelines: extensión de vídeo, multi-shot con continuidad, cadenas de edición.
- Panel de proveedores con estado y comprobación en vivo; claves propias cifradas; prioridad de proveedores.

## Implementado, pendiente de validar con servicios reales

Requiere tus API keys (no había red hacia los proveedores durante la construcción):

- Generación de imagen/vídeo/audio con Replicate, fal, Hugging Face, Black Forest Labs, ElevenLabs.
- Guion con Anthropic Claude o un servidor OpenAI-compatible.
- ComfyUI (plantillas SDXL y FLUX-schnell; necesitas los checkpoints) y Diffusers en GPU.
- Búsqueda/importación en Pexels, Pixabay y Unsplash.
- rembg local (opcional; descarga su modelo la primera vez).

## Pendiente / no incluido (y por qué)

| Elemento | Situación |
|---|---|
| Imagen a vídeo con Diffusers local | No ofrecido: la ruta local de vídeo solo cubre texto a vídeo (Wan 2.2 TI2V-5B, LTX, CogVideoX). Imagen a vídeo usa proveedores cloud. |
| Workflows de vídeo para ComfyUI (Wan, Hunyuan) | No incluidos como plantilla (sus grafos cambian con cada versión); se pueden cargar workflows propios con marcadores en el adaptador. |
| Entrenamiento de LoRA de personajes | No incluido. El campo `lora_url` del personaje existe para modelos que lo acepten, pero no hay aún una ruta de catálogo que lo use. |
| Sincronización labial (lip-sync) | No incluida. Los diálogos se colocan en la línea temporal sincronizados con el inicio de cada plano. |
| Vídeo a vídeo con cambio fuerte de movimiento de cámara | Los modelos v2v conservan el movimiento original; la UI lo advierte y sugiere regenerar el plano. |
| Verificación de email, 2FA, panel de administración, moderación propia | Recomendado antes de abrir al público (ver SECURITY.md). |
| Pagos/planes de suscripción | Fuera de alcance; el consumo se estima y se registra por usuario. |
| Pruebas de carga | No realizadas; no se afirma capacidad para miles de usuarios. |
| Construcción de imágenes Docker | Dockerfiles y Compose listos y validados sintácticamente; no se pudieron construir (sin demonio Docker). |
| Previsualización de la timeline | Muestra la pista principal y los subtítulos en el navegador; la mezcla exacta de todas las pistas se obtiene con «Renderizar». |

## Limitaciones honestas

- Ningún modelo garantiza consistencia perfecta de personajes; la plataforma combina descripción fija, referencias, semilla y modelos con referencia.
- Los costes son estimaciones con precios públicos aproximados.
- Los controles cinematográficos se aplican como indicaciones en el prompt; la fidelidad depende del modelo.
