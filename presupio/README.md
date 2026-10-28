# Presupio

SaaS B2B para que las empresas de reformas integrales recuperen presupuestos enviados que se han quedado sin respuesta: detectar, hacer seguimiento ordenado y medir qué se reactiva y qué termina en venta, **sin inflar resultados**.

> Estado: **Fase 3 de 5 — motor de seguimiento y envío automático de emails.** Probado con proveedores simulados y servidores locales; **todavía no con un proveedor de email real** (ver [`docs/automatizacion.md`](docs/automatizacion.md)). Sin pagos.

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Backend, base de datos, autenticación, multiempresa, API, seguridad y pruebas | ✅ |
| 2 | Frontend y experiencia de usuario | ✅ |
| 3 | Motor de seguimiento e integración con un proveedor de email (Mailgun UE / SMTP) | ✅ (falta la prueba con proveedor real) |
| 4 | Métricas, límites de planes y preparación para producción | Pendiente |
| 5 | Pasarela de pago y suscripciones | Pendiente |

## Stack

- **Node.js 22 + TypeScript** (ESM, modo estricto)
- **Fastify 5**: API HTTP, con cookies, CORS, Helmet y límites de peticiones
- **PostgreSQL 15+** con **Row-Level Security** para aislar los datos de cada empresa
- **Kysely**: consultas tipadas, sin ORM pesado. Las migraciones están en SQL plano.
- **Zod**: validación de entradas, con mensajes en español
- **Argon2id**: contraseñas
- **Vitest**: pruebas contra una base de datos real

**Frontend (`apps/web`):** React 19 + Vite + TypeScript, React Router y TanStack Query. Sistema de diseño propio en CSS ([`apps/web/DESIGN.md`](apps/web/DESIGN.md)), sin frameworks de UI.

Arquitectura y decisiones: [`docs/arquitectura.md`](docs/arquitectura.md). Referencia de la API: [`docs/api.md`](docs/api.md). Frontend: [`docs/frontend.md`](docs/frontend.md). Motor de seguimiento: [`docs/automatizacion.md`](docs/automatizacion.md).

## Puesta en marcha (desarrollo)

Requisitos: Node 22+, npm 10+ y PostgreSQL 15+ (local o mediante Docker).

```bash
cd presupio
cp .env.example .env          # y ajusta las contraseñas de ejemplo
npm ci
```

Si no tienes PostgreSQL instalado:

```bash
docker compose up -d
```

Crea los roles y las bases de datos de desarrollo y de pruebas (idempotente, solo en local):

```bash
npm run db:bootstrap
```

Aplica las migraciones:

```bash
npm run db:migrate
```

Opcionalmente, carga datos de demostración ficticios. Muestra el email y la contraseña generada:

```bash
npm run db:seed
```

Arranca la API en modo desarrollo (recarga automática) en http://localhost:3000/api/v1:

```bash
npm run dev
```

En otra terminal, arranca el frontend en http://localhost:5173. Vite reenvía `/api` a la API, así que la cookie de sesión funciona sin configurar CORS:

```bash
npm run dev:web
```

Abre http://localhost:5173 y crea una cuenta, o entra con la cuenta de demostración que imprimió `npm run db:seed`.

Comprobación rápida:

```bash
curl http://localhost:3000/api/v1/health/ready
```

### Producción

```bash
npm ci && npm run build
```

```bash
npm run db:migrate            # con MIGRATION_DATABASE_URL (rol propietario)
```

```bash
npm start                     # con DATABASE_URL (rol de aplicación)
```

En producción la configuración se valida al arrancar y el proceso se niega a iniciar si:

- `COOKIE_SECURE` es `false`.
- `APP_WEB_URL` no usa `https`.
- `MAIL_TRANSPORT=log`.
- `CORS_ORIGINS` contiene `*`.
- `FOLLOWUP_EMAIL_PROVIDER=mailgun` sin `MAILGUN_WEBHOOK_SIGNING_KEY` o sin `https`.

El **proceso de envío** es un servicio aparte de la API, con las mismas variables de entorno:

```bash
npm run worker:start -w @presupio/api        # proceso persistente
```

```bash
npm run worker -w @presupio/api -- --once    # o un ciclo por minuto desde un cron
```

## Pruebas

```bash
npm test             # API (129) + frontend (67): unitarias, de integración y de componentes
```

```bash
npm run test:e2e     # extremo a extremo en Chromium contra la API y la base de datos reales
```

Las pruebas E2E recrean la base de datos de pruebas, arrancan la API real (puerto 3100) y sirven la compilación de producción del frontend (puerto 4174) con las mismas cabeceras de seguridad (CSP) que producción. Recorren registro, presupuestos, seguimientos, venta con evidencia, exclusiones, envío automático (activación, aprobación, envío contra un simulador local de la API de Mailgun y baja del cliente), recuperación de contraseña, aislamiento entre empresas, invitaciones, errores de la API, enlaces, accesibilidad (axe) y diseño adaptable a 1440, 768 y 390 px. Necesitan Chromium de Playwright (`npx playwright install chromium` si no está instalado).

Las pruebas de la API necesitan una base de datos cuyo nombre termine en `_test`, configurada en `TEST_DATABASE_URL` y `TEST_MIGRATION_DATABASE_URL`. Cada ejecución **borra y recrea** su esquema y aplica las migraciones.

```bash
npm test
```

```bash
npm run typecheck
```

La suite (129 pruebas, 9 archivos en `apps/api/test/`) cubre:

| Archivo | Qué verifica |
|---|---|
| `auth.test.ts` | Registro, login y logout, cookies seguras, hash Argon2id, recuperación de contraseña (token de un solo uso, caducidad, cierre de sesiones), cambio de contraseña, verificación de email y límites de intentos |
| `tenancy.test.ts` | Aislamiento entre dos empresas: listados, acceso por id (404), modificaciones, enlaces cruzados, `companyId` inyectado y RLS directamente en PostgreSQL |
| `authorization.test.ts` | Roles (propietario, administrador, comercial, lector), gestión de miembros, siempre un propietario, cambios de rol inmediatos, invitaciones e imposibilidad de asignarse un plan |
| `protection.test.ts` | Todas las rutas privadas devuelven 401 sin sesión (se recorren automáticamente), CSRF por origen, solo JSON, CORS y cabeceras de seguridad |
| `quotes.test.ts` | CRUD y paginación, máquina de estados, reactivación, venta con evidencia, seguimientos, exclusiones y contactos |
| `validation.test.ts` | Validación sintáctica y semántica, errores coherentes, JSON mal formado, prototype poisoning y tamaño máximo |
| `database.test.ts` | Migraciones idempotentes con checksum, RLS en todas las tablas de empresa, restricciones, claves foráneas compuestas y cascadas |
| `automation.test.ts` | Motor de seguimiento: programación 3/7/14, respuestas, aceptación y rechazo, baja, ciclos simultáneos sin duplicados, errores del proveedor, límite de reintentos, aislamiento, reinicios, aprobación, franjas, plantillas, webhooks firmados y conservación (proveedor **simulado**) |
| `automation-units.test.ts` | Calendario con cambios de hora, plantillas, firma de webhooks y adaptadores Mailgun y SMTP contra servidores **locales** |

CI: `.github/workflows/presupio.yml` ejecuta la comprobación de tipos, la compilación y las pruebas con PostgreSQL 16 en cada cambio dentro de `presupio/`.

## Variables de entorno

Todas están documentadas en [`.env.example`](.env.example). Las principales:

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión con el **rol de aplicación**: sin superusuario, sin `BYPASSRLS` y sin DDL |
| `MIGRATION_DATABASE_URL` | Para migrar | Conexión con el **rol propietario** del esquema |
| `APP_WEB_URL` | Sí (https en producción) | URL del frontend: enlaces de los emails y CORS por defecto |
| `CORS_ORIGINS` | No | Orígenes permitidos separados por comas. No admite `*` |
| `COOKIE_SECURE` | No | `true` por defecto en producción, donde es obligatorio |
| `TRUST_PROXY` | No | `true`, `false` o número de saltos de proxy, para obtener la IP real |
| `SESSION_TTL_HOURS` / `SESSION_IDLE_TIMEOUT_HOURS` | No | Duración máxima de la sesión (por defecto 30 días) y cierre por inactividad (por defecto 7 días) |
| `TRIAL_DAYS` | No | Días de prueba gratuita con los límites de Starter (por defecto 14; `0` = sin prueba) |
| `MAIL_TRANSPORT` | No | `disabled` (por defecto), `log` (solo desarrollo) o `smtp` |
| `MAIL_FROM`, `SMTP_*` | Con `smtp` | Proveedor de correo |
| `DATABASE_ADMIN_URL` | Solo `db:bootstrap` | Superusuario local para crear roles y bases de datos |
| `TEST_DATABASE_URL`, `TEST_MIGRATION_DATABASE_URL` | Solo pruebas | Base de datos `*_test` |
| `RATE_LIMIT_PER_MINUTE` | No | Peticiones a la API por IP y minuto (por defecto 600) |
| `FOLLOWUP_EMAIL_PROVIDER` | No | `disabled` (por defecto: no se envía nada), `mailgun` o `smtp`. Detalle de `FOLLOWUP_*`, `MAILGUN_*`, `PUBLIC_API_URL`, `WORKER_INTERVAL_SECONDS` y `MESSAGE_CONTENT_RETENTION_DAYS` en [`docs/automatizacion.md`](docs/automatizacion.md#5-variables-de-entorno) |
| `VITE_API_BASE_URL` | No (frontend) | Ruta de la API desde el navegador. Por defecto `/api/v1`, mismo origen. Ver [`apps/web/.env.example`](apps/web/.env.example) |

## Servicios externos no configurados

- **Correo:** el SMTP está implementado pero **no se ha probado con un proveedor real**. Con `MAIL_TRANSPORT=disabled`, la API **no simula el envío**: responde `delivery: "not_configured"` y lo registra en el log. Hasta configurarlo, los emails de verificación, recuperación e invitación no llegan. Las invitaciones devuelven su enlace (`acceptUrl`) para compartirlo manualmente.
- **Pagos:** no están integrados (fase 5). El plan solo lo asigna el servidor (prueba gratuita al registrarse) y no hay ningún endpoint para modificarlo.
- **Envío automático de seguimientos:** implementado con Mailgun (región UE) y SMTP como alternativa. **No se ha probado con un proveedor real** (sin cuenta ni credenciales; la red del entorno de desarrollo bloquea Mailgun). Con `FOLLOWUP_EMAIL_PROVIDER=disabled` no se envía nada. Pasos para la puesta en producción en [`docs/automatizacion.md`](docs/automatizacion.md#puesta-en-producción).

## Estructura

```
presupio/
├── apps/api/
│   ├── migrations/          SQL versionado (0001_init.sql, 0002_follow_up_engine.sql)
│   ├── scripts/             db-bootstrap, migrate, seed
│   ├── src/
│   │   ├── app.ts           montaje de Fastify: seguridad, errores y rutas
│   │   ├── server.ts        arranque y apagado ordenado
│   │   ├── worker.ts        proceso de envío (motor de seguimiento)
│   │   ├── automation/      calendario, plantillas, proveedores, motor y ciclo de trabajos
│   │   ├── config.ts        variables de entorno validadas
│   │   ├── db/              conexión, contexto de empresa (RLS), migrador y tipos
│   │   ├── domain/          permisos, estados de presupuesto y planes
│   │   ├── lib/             errores, validación, criptografía, contraseñas, límites y paginación
│   │   ├── mail/            proveedores de correo y plantillas
│   │   ├── plugins/auth.ts  sesiones, rutas privadas por defecto y permisos
│   │   └── modules/         auth, me, company, members, contacts, quotes, follow-ups, exclusions, activity, health, automation, public, webhooks
│   └── test/                pruebas de integración
├── apps/web/
│   ├── src/api/             cliente HTTP único, tipos de la API y consultas (TanStack Query)
│   ├── src/auth/            sesión, rutas privadas y cierre de sesión
│   ├── src/components/      componentes base, diálogo, menú, avisos y plano de cartera
│   ├── src/layout/          estructura de la app (raíl, barra superior, navegación inferior)
│   ├── src/pages/           pantallas
│   ├── src/styles/          tokens y estilos del sistema de diseño
│   ├── test/                pruebas unitarias y de componentes (Vitest)
│   └── e2e/                 pruebas de extremo a extremo (Playwright)
├── docs/                    arquitectura, API, frontend y automatización
├── docker-compose.yml       PostgreSQL local
└── .env.example
```
