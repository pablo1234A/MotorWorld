# MotorWorld Studio

Estudio de producción audiovisual con inteligencia artificial: genera imágenes y vídeos, edita fotografías y vídeos con instrucciones en lenguaje natural, produce películas completas (guion → personajes → storyboard → clips → voces → montaje) y exporta el resultado, usando el mejor modelo disponible en cada paso **sin depender de un único proveedor**.

> Estado: producto funcional de extremo a extremo. Todo el procesamiento local (FFmpeg/Pillow), la cola de trabajos distribuida, el sistema de usuarios, la biblioteca, el editor multipista y el estudio de películas se han **probado de verdad**. Las generaciones con IA en la nube necesitan tus API keys: los adaptadores están verificados contra los contratos HTTP documentados de cada proveedor, pero **no se pudieron ejecutar contra los servicios reales** en el entorno de construcción (la red bloqueaba sus dominios). Ver [docs/STATUS.md](docs/STATUS.md).

## Qué incluye

| Sección | Qué hace (real) |
|---|---|
| **Inicio** | Panel con accesos, últimas generaciones, motores activos, consumo y almacenamiento. |
| **Crear imágenes** | Texto a imagen, imagen a imagen, variaciones, ampliación. 13 estilos, composición, semilla, guidance, pasos, nº de imágenes, formato, referencia visual. Los controles se generan desde el registro del modelo: lo que un modelo no admite no se muestra. |
| **Crear vídeos** | Texto a vídeo, imagen a vídeo, primer/último fotograma, vídeo a vídeo, **extensión** (último fotograma → continuación → unión con FFmpeg), **multi-shot** con continuidad entre planos, 16 movimientos de cámara y control cinematográfico (plano, óptica, profundidad de campo, luz, velocidad, ambiente, grading, estética), cámara lenta real con interpolación. |
| **Crear películas** | Idea → guion con LLM (Claude u OpenAI-compatible, p. ej. Ollama local) → personajes con referencias visuales → localizaciones → storyboard editable → producción por lotes (referencias, fotogramas, clips, diálogos TTS, efectos, música) → montaje automático en línea temporal → render. |
| **Editor de imágenes** | Instrucción en lenguaje natural → plan de pasos (local o generativo, con modelo elegido) → ejecución. Máscaras con pincel, inpainting, outpainting, quitar/cambiar fondo, restaurar, ampliar, retoque de color local, antes/después, deshacer/rehacer e historial. El original nunca se sobrescribe. |
| **Editor de vídeos** | Planificador que separa operaciones **FFmpeg** (corte, velocidad, cámara lenta, interpolación, estabilización, color, reencuadre inteligente, letterbox, grano, subtítulos, texto, audio) de las **generativas** (vídeo a vídeo, ampliación IA, extensión, sonido sincronizado). Edición por segmentos. |
| **Estudio creativo** | Voces (TTS), música, efectos, audio sincronizado con vídeo, mezcla multipista, limpieza/normalización; **editor de montaje multipista** (vídeo, superposición, diálogos, música, efectos, subtítulos, transiciones, recortes, velocidad, volumen) con render FFmpeg y exportación **OpenTimelineIO** y **SRT**; buscador de recursos gratuitos (Pexels, Pixabay, Unsplash) con atribución. |
| **Modelos de IA** | Catálogo de 38 modelos con tareas, resoluciones, duraciones, limitaciones, coste, licencia y disponibilidad; filtros; **panel de proveedores** con estado, nivel gratuito, comprobación en vivo y qué falta configurar. |
| **Biblioteca / Proyectos / Historial / Favoritos** | Archivos privados por usuario, proyectos, historial con cancelar/reintentar/duplicar/guardar/descargar/eliminar, intentos y fallback registrados. |
| **Configuración / Ayuda** | Perfil, contraseña, sesiones, claves API propias cifradas, prioridad de proveedores, eliminación de cuenta; centro de ayuda, privacidad y condiciones. |

## Arquitectura en una línea

`Next.js 15 (React 19, TS, Tailwind 4)` → `Caddy` → `FastAPI` → `PostgreSQL` + `Redis/arq` (colas independientes: generación remota, medios FFmpeg, GPU) → `S3/MinIO` · adaptadores intercambiables: **Replicate, fal, Hugging Face, Black Forest Labs, ComfyUI, Diffusers (GPU), ElevenLabs, Anthropic, OpenAI-compatible, motor local**. Detalle en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Puesta en marcha

### Opción A — Docker Compose (recomendada)

```bash
cp .env.example .env
# Rellena SECRET_KEY, ENCRYPTION_KEY, POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD
# y las API keys que tengas (todas opcionales).
docker compose up -d --build
# → http://localhost   (API docs: http://localhost/api/docs)
```

Servicios: `postgres`, `redis`, `minio`, `migrate` (Alembic), `api`, `worker-generate`, `worker-media`, `web`, `proxy` (Caddy, HTTPS automático con `SITE_ADDRESS=tu.dominio`), `backup` (perfil) y `worker-gpu` (perfil, NVIDIA).

### Opción B — Desarrollo sin Docker

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r backend/requirements-dev.txt          # requiere ffmpeg en el sistema
cd backend && QUEUE_MODE=inline uvicorn app.main:app --reload   # SQLite + cola en proceso
# en otra terminal
cd frontend && npm install && npm run dev            # http://localhost:3000
```

Con PostgreSQL y Redis locales usa `QUEUE_MODE=arq` y `scripts/local_stack.sh start` (API + workers).

## Pruebas

```bash
cd backend && python -m pytest -q                          # 54 pruebas (SQLite)
TEST_DATABASE_URL=postgresql+asyncpg://… TEST_REDIS_URL=redis://… python -m pytest -q   # mismas pruebas en Postgres+Redis
python scripts/integration_test.py --base http://localhost:8000   # 36 comprobaciones contra la pila en marcha
cd frontend && npx playwright test                          # 10 pruebas E2E en navegador (escritorio + móvil)
```

Resultados y alcance en [docs/TESTING.md](docs/TESTING.md).

## Documentación

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — arquitectura, flujo de trabajos, decisiones técnicas.
- [docs/PROVIDERS.md](docs/PROVIDERS.md) — investigación de proveedores: niveles gratuitos, límites, uso comercial, licencias, **API keys necesarias**.
- [docs/MODELS.md](docs/MODELS.md) — lista de modelos integrados (generada desde el registro).
- [docs/DEPLOY.md](docs/DEPLOY.md) — despliegue, HTTPS, escalado, copias de seguridad, monitorización, GPU, Supabase.
- [docs/SECURITY.md](docs/SECURITY.md) — seguridad, aislamiento y licencias.
- [docs/TESTING.md](docs/TESTING.md) — pruebas realizadas.
- [docs/STATUS.md](docs/STATUS.md) — funciones terminadas, pendientes y limitaciones conocidas.

La web anterior de MotorWorld (enciclopedia del automóvil) se conserva en `legacy/`.
