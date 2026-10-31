# Reseñalo

SaaS de suscripción que automatiza las solicitudes de reseña: cuando un negocio registra que un cliente ha terminado un servicio, Reseñalo le envía un correo personalizado **desde la cuenta Gmail u Outlook del propio negocio** (OAuth), con el enlace directo para dejar su opinión.

- **Stack**: Next.js 15 (App Router) · TypeScript · Tailwind CSS · PostgreSQL 16 + Prisma 6 · Redis + BullMQ · Stripe Billing · Gmail API · Microsoft Graph.
- **Procesos**: `web` (Next.js: interfaz + API REST) y `worker` (cola de envíos, barrido periódico, salud de conexiones, retención).

Documentación:

| Documento | Contenido |
|---|---|
| [docs/CREDENCIALES.md](docs/CREDENCIALES.md) | **Qué tienes que darme/configurar** (Stripe, Google, Microsoft, SMTP, datos legales) y dónde |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Fases, módulos, base de datos y motor de automatización |
| [docs/PRUEBAS.md](docs/PRUEBAS.md) | Las 20 pruebas exigidas: cómo se ejecutaron y su resultado real |
| [docs/SEGURIDAD_Y_DATOS.md](docs/SEGURIDAD_Y_DATOS.md) | Medidas de seguridad, aislamiento, retención y copias de seguridad |
| [docs/LEGAL_REVISION.md](docs/LEGAL_REVISION.md) | Qué debe revisar un profesional antes del lanzamiento |

## Instalación local

Requisitos: Node 20.11+ (probado con 22), PostgreSQL 14+, Redis 6.2+.

```bash
npm install
```

```bash
cp .env.example .env   # y edita los valores (como mínimo DATABASE_URL, REDIS_URL, ENCRYPTION_KEYS, APP_URL)
```

```bash
npm run db:migrate && npm run db:seed
```

```bash
npm run dev
```

```bash
npm run worker:dev
```

Sin `SMTP_HOST`, en desarrollo los enlaces de verificación y recuperación aparecen en el log del servidor (en producción es obligatorio un SMTP).

## Pruebas

```bash
npm test            # 79 pruebas unitarias e integración (PostgreSQL y Redis reales; BD resenalo_test)
```

```bash
npx next build && npm run test:e2e   # 11 pruebas E2E en Chromium (escritorio y móvil) contra next start + worker
```

Las pruebas de integración usan la base `resenalo_test` y Redis db 5; las E2E usan `resenalo_e2e` y Redis db 6 (créalas antes con `createdb`).

## Despliegue en un servidor

1. Copia `.env.example` a `.env` con valores de producción (`APP_URL` en https).
2. `docker compose up -d --build` (PostgreSQL, Redis, web y worker). La web aplica las migraciones y sincroniza los planes al arrancar.
3. Pon delante un proxy con TLS (Caddy, Nginx o Traefik) hacia `127.0.0.1:3000`, y reenvía `X-Forwarded-For`.
4. Configura Stripe, Google y Microsoft según [docs/CREDENCIALES.md](docs/CREDENCIALES.md).
5. Programa `scripts/backup-db.sh` en cron (diario) y copia las copias fuera del servidor.
6. Monitorización: `GET /api/health` (BD + Redis) y `ERROR_WEBHOOK_URL` para recibir los errores críticos. Los logs son JSON estructurado (pino) por stdout.

Sin Docker: `npm ci && npm run build`, `npm run db:migrate && npm run db:seed`, y ejecuta `npm start` y `npm run worker` con systemd/pm2. El worker admite varias réplicas.

## Scripts

| Script | Uso |
|---|---|
| `npm run stripe:setup` | Crea productos y precios mensuales (IVA incluido) en Stripe e imprime sus IDs |
| `npm run db:seed` | Sincroniza los 3 planes con la BD y los vincula a los precios de Stripe |
| `npm run db:backup` | Copia de seguridad `pg_dump` con verificación y rotación |
| `npm run retention` | Aplica manualmente la política de retención (el worker la ejecuta a diario) |
