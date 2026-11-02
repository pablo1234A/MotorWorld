# Despliegue

> No se ha publicado nada ni generado ningún gasto. Estas instrucciones dejan el despliegue preparado para que lo ejecutes tú.

## 1. Servidor único con Docker Compose

Requisitos: Linux con Docker 24+, 4 vCPU / 8 GB RAM mínimo (el render FFmpeg es intensivo en CPU), disco según tu volumen de medios.

```bash
git clone <repo> && cd MotorWorld
cp .env.example .env
python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(48))" >> .env
python3 -c "from cryptography.fernet import Fernet; print('ENCRYPTION_KEY=' + Fernet.generate_key().decode())" >> .env
# Edita .env: POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD, SITE_ADDRESS=studio.tudominio.com,
# PUBLIC_WEB_URL/CORS_ORIGINS=https://studio.tudominio.com, COOKIE_SECURE=true,
# S3_PUBLIC_ENDPOINT_URL (ver nota de medios) y las API keys que tengas.
docker compose up -d --build
docker compose logs -f api worker-generate worker-media
```

- **HTTPS**: Caddy obtiene el certificado automáticamente si `SITE_ADDRESS` es un dominio que apunta al servidor (puertos 80/443 abiertos).
- **Migraciones**: el servicio `migrate` ejecuta `alembic upgrade head` antes de arrancar la API. Para nuevas versiones: `docker compose up -d --build` (vuelve a migrar).
- **Medios con MinIO**: los navegadores descargan los archivos con URLs prefirmadas de MinIO; `S3_PUBLIC_ENDPOINT_URL` debe ser la URL pública de MinIO (por ejemplo, expón `minio:9000` en `media.tudominio.com` con otro bloque de Caddy). Alternativa: usa un S3 gestionado (AWS S3, Cloudflare R2, Supabase Storage) y elimina el servicio `minio`.
- **Proveedores que leen entradas por URL**: si tu bucket es accesible desde internet pon `S3_PRESIGN_FOR_PROVIDERS=true`; si no, las entradas se envían en línea (data URI / subida al proveedor), lo que funciona siempre pero es más lento para vídeos grandes.

## 2. Supabase como infraestructura

- **Base de datos**: `DATABASE_URL=postgresql+asyncpg://postgres:<pass>@db.<ref>.supabase.co:5432/postgres` (usa la conexión directa o el *session pooler*; el *transaction pooler* no es compatible con sentencias preparadas de asyncpg). Ejecuta `alembic upgrade head`.
- **Almacenamiento**: Supabase Storage expone un endpoint compatible con S3: `STORAGE_BACKEND=s3`, `S3_ENDPOINT_URL=https://<ref>.supabase.co/storage/v1/s3`, `S3_REGION=<región>`, claves S3 del panel, `S3_BUCKET=<bucket privado>`.
- La autenticación sigue siendo la propia de la plataforma (no Supabase Auth), lo que mantiene el aislamiento en el backend.

## 3. Escalado

| Componente | Cómo escalar |
|---|---|
| `api` | Sin estado: varias réplicas detrás del proxy (`docker compose up -d --scale api=3` y balanceo en Caddy, o un orquestador). |
| `worker-generate` | I/O: `WORKER_CONCURRENCY` alto (20+) y réplicas adicionales. |
| `worker-media` | CPU: 1 réplica por cada 2–4 núcleos, `MEDIA_CONCURRENCY` 1–2. |
| `worker-gpu` | 1 réplica por GPU (`--profile gpu`). |
| PostgreSQL / Redis | Servicios gestionados en producción. |

**No se ha realizado ninguna prueba de carga**: no se afirma ninguna cifra de usuarios simultáneos. Antes de abrir el servicio, mide con tu hardware (por ejemplo con k6/Locust contra `/api/generations` en modo local) y ajusta límites.

## 4. Copias de seguridad

```bash
docker compose --profile backup run --rm backup     # pg_dump + espejo del bucket en ./backups/<fecha>
```

Prográmalo con cron del host (p. ej. diario a las 03:17) y copia `./backups` fuera del servidor. Restaurar: `pg_restore -d <url> backups/<fecha>/db.dump` y `mc mirror` de vuelta al bucket.

## 5. Monitorización y logs

- `GET /api/health`: base de datos, Redis, almacenamiento y FFmpeg (úsalo en el balanceador/uptime).
- `GET /api/metrics`: Prometheus (peticiones, latencia por ruta, trabajos por estado).
- Logs JSON (`LOG_JSON=true`) con `request_id`; rotación configurada en Compose. Cada respuesta lleva `X-Request-ID`.

## 6. GPU local (opcional)

```bash
docker compose --profile gpu up -d worker-gpu
```

Requiere NVIDIA Container Toolkit. Los pesos se descargan del Hub de Hugging Face la primera vez (volumen `hfcache`; los repos con acceso restringido necesitan `HF_TOKEN` con licencia aceptada). Para ComfyUI, ejecútalo aparte y define `COMFYUI_URL`.

## 7. Lista de comprobación antes de producción

- [ ] `ENVIRONMENT=production`, `SECRET_KEY` y `ENCRYPTION_KEY` aleatorios (la API se niega a arrancar si no).
- [ ] `COOKIE_SECURE=true` y HTTPS.
- [ ] SMTP configurado (recuperación de contraseña).
- [ ] Textos legales completados con los datos del operador (`/legal/privacy`, `/legal/terms`).
- [ ] Revisar licencias de los modelos que vayas a ofrecer y el uso comercial de cada plan de proveedor.
- [ ] Límites (`MAX_ACTIVE_JOBS_PER_USER`, `DAILY_GENERATION_LIMIT`, cuotas) y alertas de gasto en cada proveedor.
- [ ] Copias de seguridad programadas y probadas.
