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
| GET | `/company/settings` | Lectura | Reglas base de seguimiento |
| PATCH | `/company/settings` | owner/admin | Opcionales: `firstFollowUpAfterDays, followUpIntervalDays, maxFollowUps, allowedWeekdays[1-7], contactWindowStart "HH:MM", contactWindowEnd, defaultChannel, requireManualApproval, legalBasisNote` |
| GET | `/company/subscription` | Lectura | `{ subscription: { plan, status, trialEndsAt, hasActiveAccess, planDetails, paymentsEnabled }, plans[] }`. Solo lectura |

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
| GET | `/quotes/summary` | Lectura | Recuento por estado, `responded`, `reactivated`, `recoveredSales`, `recoveredAmountCents` (declarado por la empresa) y seguimientos `pending`, `overdue` y `completed` (contactos realizados; las tareas internas no cuentan) |
| POST | `/quotes` | Escritura | Ver los campos debajo |
| GET | `/quotes/:id` | Lectura | `{ quote, pendingFollowUps, allowedTransitions[] }` |
| PATCH | `/quotes/:id` | Escritura | `title, contactId, reference, description, amountCents, currency, sentAt, validUntil, ownerUserId`. **No** acepta el estado |
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
- Obligatorio: `status`.
- Opcionales: `occurredAt` (no puede ser futura ni anterior al envío), `note`, `rejectionReason`.
- Para `accepted`: **`evidence` es obligatoria**; `acceptedAmountCents` es opcional.
- Responde `{ quote, reactivated, cancelledFollowUps }`.

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
| GET | `/follow-ups` | Lectura | Filtros: `status` (por defecto `pending`), `assignedTo=me\|<uuid>`, `quoteId`, `dueBefore` |
| GET | `/follow-ups/:id` | Lectura | Detalle |
| PATCH | `/follow-ups/:id` | Escritura | Solo si está pendiente: `title, notes, dueAt, assignedUserId` |
| POST | `/follow-ups/:id/complete` | Escritura | `outcome?, notes?, completedAt?` |
| POST | `/follow-ups/:id/cancel` | Escritura | `reason?` |

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
