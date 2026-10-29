# API de Presupio · v1

Base: `/api/v1`. El cuerpo de todas las peticiones y respuestas es JSON.

## Convenciones

**Autenticación**
- Cookie de sesión `HttpOnly`. Desde el navegador, usa `fetch(..., { credentials: 'include' })`.
- **Todas las rutas son privadas** salvo las marcadas como públicas. Sin sesión → `401 UNAUTHENTICATED`.
- Un permiso insuficiente → `403 FORBIDDEN`. Un recurso de otra empresa → `404 NOT_FOUND`.

**Errores** con este formato:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Los datos enviados no son válidos.", "details": [{ "path": "email", "message": "Email no válido" }], "requestId": "…" } }
```

Códigos posibles:

| Código | Estado HTTP |
|---|---|
| `VALIDATION_ERROR` | 400 |
| `INVALID_JSON` | 400 |
| `INVALID_TOKEN` | 400 |
| `UNAUTHENTICATED` | 401 |
| `INVALID_CREDENTIALS` | 401 |
| `FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 |
| `CONFLICT` | 409 |
| `INVALID_STATE_TRANSITION` | 409 |
| `CONTACT_EXCLUDED` | 409 |
| `PAYLOAD_TOO_LARGE` | 413 |
| `UNSUPPORTED_MEDIA_TYPE` | 415 |
| `RATE_LIMITED` | 429 |
| `SERVICE_UNAVAILABLE` | 503 |
| `INTERNAL_ERROR` | 500 |

**Formatos y paginación**
- Campos desconocidos en el cuerpo o en la query → `400`. No se aceptan `companyId`, `role`, `plan`, etc.
- Fechas en ISO 8601 con zona horaria; fechas sin hora en `AAAA-MM-DD`; importes en **céntimos** (enteros).
- Los listados devuelven `{ items, nextCursor }`. Para la página siguiente, pasa `?cursor=<nextCursor>`; `limit` va de 1 a 100 (25 por defecto).
- Cada respuesta lleva la cabecera `x-request-id` para el soporte.

## Salud (públicas)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Proceso vivo |
| GET | `/health/ready` | La base de datos responde (503 si no) |

## Autenticación — `/auth`

| Método | Ruta | Acceso | Cuerpo | Respuesta |
|---|---|---|---|---|
| POST | `/auth/register` | Pública | `fullName, email, password, companyName, acceptTerms: true` | 201 `{ user, company, role, emailVerification: { delivery } }` y cookie de sesión |
| POST | `/auth/login` | Pública | `email, password, companyId?` | `{ user, company, role, memberships }` y cookie de sesión |
| POST | `/auth/logout` | Pública | — | 204 |
| POST | `/auth/password/forgot` | Pública | `email` | 202 (misma respuesta exista o no el email) |
| POST | `/auth/password/reset` | Pública | `token, password` | 200; cierra todas las sesiones |
| POST | `/auth/password/change` | Sesión | `currentPassword, newPassword` | 200; cierra las demás sesiones |
| POST | `/auth/email/verify` | Pública | `token` | 200 |
| POST | `/auth/email/verification` | Sesión | — | 202 `{ delivery }` (reenvío) |
| POST | `/auth/switch-company` | Sesión | `companyId` | `{ company, role }` |
| POST | `/auth/invitations/preview` | Pública | `token` | `{ email, role, companyName, expiresAt, accountExists }` |
| POST | `/auth/invitations/accept` | Pública | `token`; sin sesión, además `fullName, password, acceptTerms` | `{ user, company, role }` |

`delivery` vale `sent`, `not_configured` o `failed`. Nunca se finge un envío.

Los enlaces de los emails apuntan al frontend, que debe enviar el `token` a la API:

| Email | Página del frontend |
|---|---|
| Recuperación de contraseña | `APP_WEB_URL/restablecer-contrasena?token=…` |
| Verificación de email | `APP_WEB_URL/verificar-email?token=…` |
| Invitación | `APP_WEB_URL/aceptar-invitacion?token=…` |

## Usuario y empresa

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/me` | Sesión | `{ user, company, role, permissions[], memberships[], subscription }` |
| PATCH | `/me` | Sesión | `fullName` |
| GET | `/company` | Lectura | Datos de la empresa |
| PATCH | `/company` | owner/admin | Opcionales: `name, legalName, taxId, phone, website, timezone` |
| GET | `/company/settings` | Lectura | Reglas de seguimiento y datos de envío (incluye `automationEnabled`, `automationEnabledAt`) |
| PATCH | `/company/settings` | owner/admin | Opcionales: `followUpScheduleDays` (1–6 días entre 1 y 180, de menor a mayor; por defecto `[3, 7, 14]`), `allowedWeekdays[1-7]`, `contactWindowStart "HH:MM"`, `contactWindowEnd`, `defaultChannel`, `requireManualApproval`, `legalBasisNote`, `senderName`, `replyToEmail`. Con el envío automático activo no se puede vaciar `replyToEmail` ni `legalBasisNote` |
| GET | `/company/subscription` | Lectura | `{ subscription: { plan, status, trialEndsAt, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, pastDueSince, hasActiveAccess, readOnly, accessEndedAt, dataRetentionUntil, planDetails, paymentsEnabled, managedByProvider, hasBillingAccount, taxDisplay }, plans[] }`. Cada plan: `priceCents, monthlyAttemptLimit, dailyAutomaticEmailLimit, fairUse`. Solo lectura |
| GET | `/company/export` | owner/admin (`data:export`) | Exportación JSON de todos los datos de la empresa (adjunto). Máx. 5 por hora |

## Miembros — `/members`

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/members` | Lectura | Lista: `userId, fullName, email, role, joinedAt` |
| PATCH | `/members/:userId` | owner/admin | `role`; aplica las reglas de propietarios |
| DELETE | `/members/:userId` | owner/admin | Baja; cierra sus sesiones en la empresa |
| GET | `/members/invitations` | owner/admin | Invitaciones abiertas |
| POST | `/members/invitations` | owner/admin | `email, role (admin\|member\|viewer)` → `{ invitation, acceptUrl, delivery }` |
| DELETE | `/members/invitations/:id` | owner/admin | Revoca la invitación |

## Contactos — `/contacts`

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/contacts?q=` | Lectura | Búsqueda por nombre, email, teléfono u organización |
| POST | `/contacts` | Escritura | `fullName`, `email` y/o `phone` (al menos uno), `organization?, preferredChannel?, notes?` |
| GET | `/contacts/:id` | Lectura | `{ contact, activeExclusions[], quotes[] }` |
| PATCH | `/contacts/:id` | Escritura | Campos editables del contacto |

## Presupuestos — `/quotes`

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/quotes` | Lectura | Filtros: `status=sent,responded`, `q`, `ownerUserId`, `contactId`, `archived=false\|true\|all` |
| GET | `/quotes/summary` | Lectura | Recuento por estado, `responded`, `reactivated`, `recoveredSales`, `recoveredAmountCents` (declarado por la empresa) y seguimientos `pending`, `overdue`, `completed` (contactos realizados y emails automáticos enviados; las tareas internas no cuentan), `failed` y `awaitingApproval` |
| POST | `/quotes` | Escritura | Ver los campos debajo |
| GET | `/quotes/:id` | Lectura | `{ quote, pendingFollowUps, allowedTransitions[] }` |
| PATCH | `/quotes/:id` | Escritura | `title, contactId, reference, description, amountCents, currency, sentAt, validUntil, ownerUserId, autoFollowUpEnabled` (`false` cancela sus emails automáticos pendientes). **No** acepta el estado |
| POST | `/quotes/:id/status` | Escritura | Ver los campos debajo |
| POST | `/quotes/:id/archive` | Escritura | Archiva y cancela los seguimientos pendientes |
| POST | `/quotes/:id/unarchive` | Escritura | Desarchiva |
| GET | `/quotes/:id/activity` | Lectura | Historial de la oportunidad (paginado) |
| GET | `/quotes/:id/follow-ups?status=` | Lectura | Seguimientos del presupuesto |
| POST | `/quotes/:id/follow-ups` | Escritura | Ver los campos debajo |

**Crear un presupuesto** (`POST /quotes`):
- Obligatorio: `title`, y uno de `contactId` o `contact: {...}`. Un contacto nuevo con un email ya existente se reutiliza.
- Opcionales: `reference`, `description`, `amountCents`, `currency`, `status: draft|sent` (por defecto `sent`), `sentAt`, `validUntil`, `ownerUserId` (por defecto, quien lo crea).

**Cambiar el estado** (`POST /quotes/:id/status`):
- Si la respuesta llega en los 30 días siguientes a un seguimiento realizado, se registra una **recuperación** en la misma transacción (ver [`limites-y-metricas.md`](limites-y-metricas.md)).
- Obligatorio: `status`.
- Opcionales: `occurredAt` (no puede ser futura ni anterior al envío), `note`, `rejectionReason`.
- Para `accepted`: **`evidence` es obligatoria**; `acceptedAmountCents` es opcional.
- Responde `{ quote, reactivated, cancelledFollowUps, recovery, recoveryNotCounted }`. `recovery` es `null` o `{ status: counted|over_limit|no_active_plan, used, limit }`. `recoveryNotCounted` explica por qué una respuesta con seguimiento registrado no cuenta (`response_dated_before_follow_up` o `follow_up_outside_window`) y queda en el historial como `recovery.not_counted`.

**Crear un seguimiento** (`POST /quotes/:id/follow-ups`):
- Obligatorio: `channel` (`task|email|phone|whatsapp|sms|in_person`).
- Opcionales: `title`, `notes`, `dueAt`, `assignedUserId`.
- Para registrar uno ya hecho: `status: "completed"`, con `outcome?` y `completedAt?`.

**Cada presupuesto (`quote`) incluye:**
- `contact`, `owner` y `acceptance`. `acceptance` contiene `evidence`, `amountCents` y `amountSource: "declared_by_company"`.
- `outcome: { responded, reactivated, recoveredSale }`. Son etapas separadas: responder no es reactivar y reactivar no es vender.

## Seguimientos — `/follow-ups`

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/follow-ups` | Lectura | Filtros: `status` (`pending` por defecto, `sending`, `sent`, `completed`, `failed`, `cancelled`, `all`), `approval=awaiting` (emails automáticos sin aprobar), `assignedTo=me\|<uuid>`, `quoteId`, `dueBefore` |
| GET | `/follow-ups/:id` | Lectura | Detalle |
| PATCH | `/follow-ups/:id` | Escritura | Solo manuales y pendientes: `title, notes, dueAt, assignedUserId` |
| POST | `/follow-ups/:id/complete` | Escritura | Solo manuales: `outcome?, notes?, completedAt?` |
| POST | `/follow-ups/:id/cancel` | Escritura | `reason?` (también emails automáticos pendientes) |
| GET | `/follow-ups/:id/preview` | Lectura | Email automático: `{ preview: { to, replyTo, subject, body, text, approved, templateStep, templateVersion } }`. Lo aprobado o lo que se enviaría ahora |
| POST | `/follow-ups/:id/approve` | Escritura | Aprueba un email automático pendiente y guarda la instantánea que se enviará |
| GET | `/follow-ups/:id/deliveries` | Lectura | Intentos de envío: `attemptNumber, status (sending\|sent\|delivered\|failed\|unknown), provider, providerMessageId, recipient, subject, bodyText, contentPurgedAt, templateStep, templateVersion, errorCode, errorDetail, createdAt, sentAt, deliveredAt, failedAt` |

Los seguimientos incluyen además `sequenceStep`, `approvedAt`, `approvedByUserId`, `attemptCount`, `sentAt` y `failureReason` (solo con valor en los emails automáticos, `source: "rule"`).

## Envío automático — `/automation`

Funcionamiento completo en [`automatizacion.md`](automatizacion.md).

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/automation` | Lectura | `{ automation: { enabled, enabledAt, enabledBy, requireApproval, schedule, requirements }, provider: { name, configured, tracksDelivery, fromDomain }, counts: { scheduled, awaitingApproval, sending, sent30d, delivered30d, failed }, worker: { healthy, lastRuns[] } }` |
| POST | `/automation/enable` | owner/admin | `confirmLegalBasis: true`. 409 sin proveedor configurado; 400 con `details` si falta `replyToEmail`, `legalBasisNote`, un plan activo o el **email confirmado** de quien lo activa (`emailVerified`) |
| POST | `/automation/disable` | owner/admin | `{ enabled: false, cancelledFollowUps }` |
| GET | `/automation/templates` | Lectura | `{ items: [{ step, offsetDays, version, subject, body, updatedAt }], variables }` |
| GET | `/automation/templates/:step/versions` | Lectura | Historial de versiones del paso |
| PUT | `/automation/templates/:step` | owner/admin | `subject, body` → versión nueva (400 si hay variables desconocidas o llaves mal cerradas) |
| POST | `/automation/templates/preview` | Lectura | `subject, body, quoteId?` → `{ preview: { subject, text, html, sample } }`. No envía nada |
| POST | `/automation/test-email` | owner/admin | Envía el primer email con datos de ejemplo **solo a quien lo pide**. Máx. 5 por hora. `{ delivery: "sent", to, providerMessageId }` o `{ delivery: "failed", error }` |

## Consumo del plan y métricas

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/usage` | Lectura | `{ usage: { plan, status, trialEndsAt, hasActiveAccess, period: { start, end, source, timezone }, attempts: { used, inProgress, limit, remaining, warningAt, limitReachedAt, level: ok\|warning\|reached\|no_plan }, automaticEmails: { today, dailyLimit }, recoveriesRecorded, events: [intentos del periodo] } }`. Ninguna ruta cambia el consumo |
| GET | `/metrics?month=AAAA-MM` | Lectura | Mes natural (por defecto, el actual) en la zona horaria de la empresa: `{ metrics: { period, quotes, followUps, outcomes, attempts: { counted }, recoveries: { recorded }, responseRate }, history: [6 meses, con attemptsCounted] }`. 400 si el mes es futuro o no válido. `responseRate.rate` es `null` con menos de 10 casos |

## Facturación — `/billing` (Stripe, solo modo de prueba)

Guía completa: [`facturacion.md`](facturacion.md).
- Las acciones solo **piden** cambios a Stripe: el plan y el acceso cambian con el webhook verificado.
- Sin `PAYMENTS_ENABLED`, las acciones responden `409 PAYMENTS_DISABLED`.
- Si Stripe no responde, `503 PAYMENTS_UNAVAILABLE` sin detalles.
- El cuerpo solo admite `plan` (`starter|pro|business`); cualquier otro campo, `400`.
- Todas funcionan en solo lectura.

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/billing` | Lectura | `{ subscription, plans[], events[] }` (resumen del historial de facturación, sin datos de pago) |
| POST | `/billing/checkout` | Propietario | `{ plan }` → `{ checkout: { url } }` (Stripe Checkout). 409 si ya hay una suscripción viva o si el precio de Stripe no coincide con el catálogo |
| POST | `/billing/change-plan` | Propietario | `{ plan }` → `{ change: { status: "pending_confirmation", mode: upgrade\|downgrade, limitAppliesFrom: confirmation\|next_period } }`. Solo con la suscripción activa |
| POST | `/billing/cancel` · `/billing/resume` | Propietario | Cancela al final del periodo o anula la cancelación → `{ cancellation: { status, accessUntil } }` |
| POST | `/billing/portal` | Propietario | `{ portal: { url } }`: portal de cliente de Stripe (método de pago, facturas) |

**Solo lectura.** Sin plan activo, toda petición que modifica datos responde `403 SUBSCRIPTION_REQUIRED`, salvo las excepciones de [`facturacion.md`](facturacion.md#5-fin-de-la-prueba-y-solo-lectura).

## Supervisión (monitor externo)

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/ops/status` | `Authorization: Bearer <OPS_STATUS_TOKEN>` | Cifras agregadas: `status (ok\|degraded), alerts[], review[], worker, followUps, deliveries, jobs, recoveries, attempts, billing`. Alertas nuevas: `attempts_reserved_stuck`, `billing_events_failed`, `billing_duplicate_subscription`. Sin datos de empresas ni personas. 404 sin token válido o sin token configurado |

Si la base de datos no está disponible, cualquier ruta responde `503 SERVICE_UNAVAILABLE` con `Retry-After`.

## Públicas: baja y webhooks

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/public/unsubscribe/preview` | `token` → `{ companyName, alreadyUnsubscribed }` (página `APP_WEB_URL/baja?token=…`) |
| POST | `/public/unsubscribe` | `token` (JSON) o `?token=` con `List-Unsubscribe=One-Click` (formulario, RFC 8058). Idempotente |
| POST | `/webhooks/mailgun` | Eventos firmados de Mailgun. 401 con firma no válida o caducada; `{ status: "duplicate" }` si el token ya se procesó; 404 si el proveedor no es Mailgun |
| POST | `/webhooks/stripe` | Eventos de Stripe con `Stripe-Signature`, verificada sobre el cuerpo original. Respuestas: <ul><li>400 con firma no válida o caducada;</li><li>`{ received: true, outcome: applied\|ignored\|stale\|unmatched\|error\|duplicate_subscription\|duplicate }`;</li><li>503 si Stripe no responde (Stripe reintenta);</li><li>404 sin pagos activos.</li></ul> |

## Exclusiones — `/exclusions`

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/exclusions?status=active\|lifted\|all` | Lectura | Lista de exclusión |
| POST | `/exclusions` | Escritura (también member) | `contactId?`, `email?`, `phone?` (al menos uno), `channel?` (null = todos), `reason`, `notes?` → `{ exclusion, cancelledFollowUps }` |
| POST | `/exclusions/:id/lift` | owner/admin | `reason` (obligatorio) |

## Actividad — `/activity`

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/activity?entityType=` | Lectura | Historial de la empresa. Cada entrada tiene `action` (p. ej. `quote.status_changed`), `entityType`, `entityId`, `quoteId`, `quote` (`id`, `title`, `reference`), `metadata`, `actor` y `createdAt` |
