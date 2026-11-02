# Arquitectura

```
                 ┌──────────────────────── Navegador ────────────────────────┐
                 │ Next.js 15 · React 19 · TanStack Query · Tailwind 4         │
                 └──────────────┬─────────────────────────────────────────────┘
                                │ mismo origen (cookies httpOnly SameSite=Lax)
                        ┌───────▼────────┐
                        │  Caddy (TLS)   │  /api/* → api   ·   /* → web
                        └───┬────────┬───┘
                ┌───────────▼──┐  ┌──▼──────────┐
                │ FastAPI (api)│  │ Next (web)  │
                └─┬──────┬─────┘  └─────────────┘
       SQLAlchemy │      │ arq enqueue / abort
        ┌─────────▼┐  ┌──▼─────────────────────────────────────────────┐
        │PostgreSQL│  │ Redis: colas  mw:generate │ mw:media │ mw:gpu   │
        └─────────▲┘  └──┬───────────────┬───────────────┬──────────────┘
                  │      │               │               │
          ┌───────┴──────▼──┐  ┌─────────▼──────┐  ┌─────▼──────────┐
          │ worker-generate │  │ worker-media   │  │ worker-gpu     │
          │ I/O · 20 jobs   │  │ FFmpeg · 2 jobs│  │ Diffusers · 1  │
          └───────┬─────────┘  └───────┬────────┘  └──────┬─────────┘
                  │  adaptadores       │                  │
   Replicate · fal · HF · BFL · ComfyUI · ElevenLabs · Anthropic · OpenAI-compat
                  │                    │                  │
                  └─────────► S3 / MinIO (originales, resultados, miniaturas) ◄┘
```

## Backend (`backend/app`)

| Módulo | Responsabilidad |
|---|---|
| `config.py` | Configuración 12-factor (pydantic-settings). Validación de configuración insegura en producción (la API no arranca). |
| `models.py` | `User`, `RefreshSession`, `PasswordResetToken`, `ProviderCredential` (cifrada), `Project`, `Asset` (linaje `parent_id`), `Generation` (registro central de trabajos), `Film` (guion JSON validado), `Timeline` (JSON validado), `UsageEvent`. |
| `security.py` | Argon2id, JWT de acceso (15 min), tokens opacos de refresco con rotación y detección de reutilización, Fernet para claves de usuario, tokens de medios firmados. |
| `storage.py` | `LocalStorage` / `S3Storage` (S3, MinIO, R2, Supabase Storage). Claves con prefijo por usuario, protección de path traversal, URLs prefirmadas. |
| `media.py` | Validación por *magic bytes* (nunca por extensión), Pillow `verify()` + límite de píxeles, `ffprobe`, miniaturas (imagen, fotograma, forma de onda). |
| `providers/` | Contrato `ProviderAdapter` (submit/poll/cancel/health) + adaptadores + `catalog.py` (registro de modelos) + `registry.py` (credenciales y selección de rutas). |
| `services/generation.py` | Ciclo de vida de los trabajos: validación, límites, estimación de coste, ejecución con **fallback**, sondeo con progreso real, cancelación, almacenamiento de resultados, recuperación de trabajos huérfanos. |
| `services/pipelines.py` | Trabajos compuestos: extensión de vídeo, render de timeline, desarrollo de guion, cadenas de edición, producción por lotes, multi-shot. Cada paso es una `Generation` hija visible. |
| `services/ffmpeg_ops.py`, `image_ops.py` | Motor local determinista (FFmpeg/Pillow) con progreso real de `ffmpeg -progress`. |
| `services/timeline.py` | Modelo de línea temporal multipista, render con un único grafo de filtros FFmpeg, exportación OTIO/SRT. |
| `services/planner.py` | Instrucción en lenguaje natural → pasos ejecutables (parser determinista + refinado opcional con LLM restringido al mismo vocabulario). |
| `services/film.py` | Guion con LLM (salida JSON con esquema estricto), anclas de consistencia, montaje automático. |
| `worker.py` | `GenerateWorker`, `MediaWorker`, `GpuWorker` (arq) + crons de recuperación y limpieza de temporales. |

### Registro de modelos y adaptadores

Un **modelo** (`ModelSpec`) declara tareas, parámetros (`ParamSpec`: tipo, rango, opciones, avanzado), resoluciones, duraciones, licencia, uso comercial y sus **rutas** (`Route`: proveedor, endpoint por tarea, *mapper* de entrada, precio). La interfaz se construye a partir de estos datos y la API descarta cualquier parámetro no declarado, así que **ningún control finge funcionar**.

Añadir un modelo nuevo = una entrada en `catalog.py` (y, si su esquema es nuevo, una función *mapper* de ~5 líneas en el adaptador). Añadir un proveedor = una clase con `submit/poll/cancel/health` registrada en `registry.ADAPTERS`. Un test (`test_every_catalog_route_has_a_mapper`) impide registrar rutas sin implementación.

### Selección de proveedor y fallback

1. Rutas del modelo que admiten la tarea y están configuradas (clave del usuario > clave del servidor; ComfyUI/Diffusers por disponibilidad).
2. Orden: proveedor elegido explícitamente → prioridad del usuario (Configuración → Preferencias) → prioridad del catálogo.
3. Si un intento falla con error **reintentable** (red, 5xx, 429, clave inválida, sin créditos), se prueba la siguiente ruta; errores de entrada o moderación no se reintentan. Todo queda en `attempt_log`.
4. Los resultados se descargan siempre a nuestro almacenamiento (las URLs de proveedor caducan).

### Trabajos

Estados: `queued → processing → completed | failed | cancelled`. El progreso solo se rellena si el proveedor lo informa (logs tqdm de Replicate, `progress` de BFL, `ffmpeg -progress`); si no, se muestra «procesando» sin porcentaje.

- **Colas independientes**: generación remota (I/O, alta concurrencia), medios (CPU), GPU. Un render pesado no bloquea las generaciones.
- **Cancelación**: bandera `cancel_requested` (el bucle de sondeo cancela en el proveedor) + `abort` de arq para trabajo local; se propaga a los pasos hijos.
- **Reintentar / duplicar**: reencola o crea una copia (con cambios opcionales).
- **Recuperación**: cron cada 2 min; trabajos sin *heartbeat* > `STALE_JOB_MINUTES` se reencolan (y si tenían `provider_job_id`, se **reanuda el sondeo** en vez de volver a pagar la generación); tras `JOB_MAX_ATTEMPTS` se marcan como error.
- **Límites**: trabajos activos por usuario, generaciones diarias, cuota de almacenamiento, limitador de peticiones por usuario e IP (Redis, ventana fija; en memoria si no hay Redis).

## Frontend (`frontend/src`)

- `app/(auth)`: login, registro, recuperación. `app/(studio)`: las 14 secciones tras el guard de sesión (`AppShell` consulta `/api/me`; el cliente renueva el token automáticamente en 401).
- `lib/api.ts`: fetch con cookies, renovación transparente, errores tipados con `code` estable. `lib/hooks.ts`: consultas y sondeo de trabajos (se detiene al terminar).
- Componentes: `ModelPicker`/`ParamControls` (dirigidos por el registro), `GenerationCard`, `MaskCanvas`, `BeforeAfter`, `PlanEditor`, `TimelineEditor`, `AssetPicker`/`Dropzone`.
- Diseño propio: tema oscuro cinematográfico, Geist + Instrument Serif, acento «REC» `#ff5a36`, responsive (cajón lateral en móvil), `prefers-reduced-motion`.

## Decisiones técnicas relevantes

| Decisión | Motivo |
|---|---|
| **arq** en lugar de Celery | Nativo `asyncio` (los adaptadores son async), ligero, reintentos, abort y cron incluidos. |
| JSON validado (Pydantic) para guion y timeline | Se editan como documentos completos; se valida en cada guardado y se versiona (concurrencia optimista con `version`, 409 si hay conflicto). |
| Cookies httpOnly mismo origen + Bearer opcional | Sin tokens en `localStorage`; la API sigue usable desde scripts. |
| Montaje con FFmpeg (no Remotion) | El render final debe ser real en servidor, sin navegador headless ni licencia de empresa de Remotion; OTIO para interoperar con NLE profesionales. |
| Prompts en inglés para los modelos | Los modelos de imagen/vídeo siguen mejor el inglés; el guion y la UI están en el idioma del usuario. |
| Controles cinematográficos vía prompt | Casi ningún modelo expone parámetros de óptica o cámara; se indica en la UI que la fidelidad depende del modelo (Hailuo recibe además comandos de cámara entre corchetes). |
| Planificador determinista + LLM opcional | Funciona sin claves; el LLM solo reescribe prompts y no puede inventar operaciones. |
