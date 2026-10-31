# Arquitectura de Reseñalo

## Stack y por qué

| Capa | Tecnología | Motivo |
|---|---|---|
| Web + API | Next.js 15 App Router, React 19, TypeScript estricto | Un solo despliegue para la interfaz y la API REST; route handlers testeables con `Request` estándar |
| Estilos | Tailwind CSS 3 con tokens propios | Sistema de diseño coherente con la identidad del logotipo |
| Datos | PostgreSQL 16 + Prisma 6 | Integridad relacional, transacciones, bloqueos consultivos, migraciones versionadas |
| Cola | Redis + BullMQ (proceso `worker` aparte) | Envíos fuera de la petición HTTP, escalado horizontal, trabajos periódicos |
| Pagos | Stripe Billing + Checkout + Portal + Stripe Tax | Suscripciones, prorrateo, IVA y facturas sin almacenar tarjetas |
| Correo | Gmail API y Microsoft Graph (OAuth 2.0 + PKCE) mediante `fetch` | Envío desde la cuenta del negocio; sin SDK pesados; contratos verificados en pruebas |
| Correo del sistema | Nodemailer (SMTP) | Verificación, recuperación y avisos |

## Estructura

```
prisma/              esquema, migraciones (incl. CHECKs e índice parcial), seed de planes
src/config/          planes comerciales (fuente de verdad) y datos legales
src/lib/             código compartido cliente/servidor: plantillas, IVA, CSV, validación, cliente API
src/server/
  env.ts, db.ts, redis.ts, logger.ts, crypto.ts
  auth/              contraseñas (Argon2id), sesiones, contexto tenant, servicio de autenticación
  http/              envoltorio de rutas (CSRF, errores), validación zod, rate limiting
  email/             mailer del sistema, MIME, proveedores Gmail/Graph
  queue/             colas BullMQ
  modules/           lógica de negocio: business, customers, templates, campaigns, stats,
                     integrations, events-ingest, account, retention, audit,
                     email-connection, automation/{requests,sender,rules,schedule},
                     billing/{entitlements,stripe}
src/app/             páginas (marketing, auth, onboarding, /app/*) y rutas /api/*
src/worker/          proceso en segundo plano
tests/               unit, integration, e2e
```

Las rutas (`src/app/api/**/route.ts`) solo validan la entrada y delegan en `src/server/modules`. El negocio (tenant) se obtiene **siempre de la sesión** (`requireTenant`) y todas las consultas filtran por `businessId`.

## Base de datos

Tablas: `users`, `sessions`, `auth_tokens`, `businesses`, `plans`, `subscriptions`, `monthly_usage`, `invoices`, `billing_events`, `customers`, `email_connections`, `oauth_states`, `email_templates`, `automation_rules`, `automation_events`, `campaigns`, `email_jobs`, `email_logs`, `api_keys`, `inbound_webhooks`, `audit_logs`, `data_rights_requests`.

Claves foráneas con `CASCADE` en datos operativos y `SET NULL` en facturas y eventos de facturación (se conservan). Restricciones únicas para idempotencia: `(business_id, external_id)` en eventos, `(business_id, dedupe_key)` en envíos, `(business_id, email)` en clientes, `stripe_event_id`. CHECKs de contadores no negativos, ventanas horarias y emails en minúsculas.

## Motor de automatización

```
evento (manual | CSV | API | webhook | campaña)
  └─ createReviewRequest()  ── transacción + pg_advisory_xact_lock(negocio)
       1 suscripción activa  2 cupo (enviados + pendientes < límite)  3 correo conectado
       4 email válido / sin baja / sin rebote  5 duplicados (externalId, clave, periodo de espera)
       6 regla aplicable (origen, servicio, prioridad) → plantilla  7-8 render con variables
       9 EmailJob SCHEDULED/QUEUED (+ log) → BullMQ
  └─ worker: processEmailJob()
       reclamación atómica QUEUED→SENDING, revalidación, reserva de cupo
       UPDATE monthly_usage SET reserved+1 WHERE sent+reserved < email_limit
       10 envío MIME con la cuenta del negocio
       11 confirmado → SENT, sent+1  |  auth → ON_HOLD + NEEDS_REAUTH + aviso
          temporal/429 → reintento con backoff (máx. 5)  |  destinatario → BOUNCED
       12 contador actualizado solo tras la confirmación del proveedor
  └─ barrido cada 30 s: programados vencidos, huérfanos de Redis, envíos interrumpidos
```

El cupo se protege en dos capas: al crear (bloqueo por negocio, cuenta los pendientes) y al enviar (reserva atómica en SQL). Ni varias pestañas, ni peticiones directas a la API, ni varios workers pueden superar el límite (probado con concurrencia).

Estados: `SCHEDULED`, `QUEUED`, `SENDING`, `SENT` (aceptado por el proveedor), `DELIVERED` (reservado: Gmail y Graph no lo comunican), `FAILED`, `BOUNCED`, `ON_HOLD`, `BLOCKED`, `CANCELED`.

## Planes (servidor)

`src/config/plans.ts` → tabla `plans`. Las funciones se comprueban en el backend (`requireFeature`, límites de plantillas y reglas, `apiAccess`…). La interfaz solo oculta o desactiva; nunca decide.

| | Starter | Pro | Business |
|---|---|---|---|
| Correos/periodo | 30 | 70 | 200 |
| Plantillas | 1 | 10 | ilimitadas |
| Automatizaciones | 1 | 3 | 20 |
| Reglas por servicio | – | ✓ | ✓ |
| Ventanas horarias | – | – | ✓ |
| Campañas | – | ✓ | ✓ |
| Estadísticas avanzadas (por regla y origen, 1 año) | – | ✓ | ✓ |
| Exportación de estadísticas y clientes, etiquetas | – | – | ✓ |
| API y webhook entrante | – | ✓ | ✓ |

## Escalabilidad

- Web sin estado (sesiones en BD): se puede escalar horizontalmente detrás de un balanceador.
- Worker con réplicas: la reclamación atómica impide dobles envíos.
- Índices por `(business_id, status)`, `(status, scheduled_for)` y `(business_id, created_at)` para colas, historial y estadísticas.
- Límite global prudente de 10 envíos/s en la cola, más los reintentos con `Retry-After` de los proveedores (no se eluden sus límites).
