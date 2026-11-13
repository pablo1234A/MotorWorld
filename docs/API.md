# API

Todas las rutas son Route Handlers de Next.js bajo `/api`. Formato JSON:

```json
{ "data": … }                                         // éxito
{ "error": { "code": "validation_error", "message": "…", "details": { "fields": { "name": "…" } } } }
```

**Reglas comunes** (`src/server/http/handler.ts`):

- La identidad sale **siempre** de la cookie de sesión (Supabase Auth). Nunca se aceptan `user_id`/`workspace_id` del cliente: si se envían, se ignoran.
- Las peticiones `POST/PUT/PATCH/DELETE` exigen cabecera `Origin` igual a la de la app (protección CSRF) — salvo el webhook de Stripe y el cron, que tienen su propia autenticación.
- Cuerpos validados con Zod (máx. 3 MB en JSON). Identificadores no UUID → 404.
- Un recurso de otro espacio responde **404** (no se revela que existe).
- Limitación por IP y, en operaciones sensibles, también por usuario.

| Código | HTTP | Significado |
|---|---|---|
| `validation_error` | 422 | Datos no válidos (incluye `details.fields`) |
| `unauthorized` | 401 | Sin sesión |
| `forbidden` | 403 | Origen no permitido, rol sin permiso, cuenta desactivada |
| `not_found` | 404 | No existe o no es tuyo |
| `conflict` | 409 | Duplicado (SKU…), operación no aplicable |
| `limit_reached` / `plan_required` | 402 | Límite del plan / función no incluida |
| `payload_too_large` / `unsupported_media_type` | 413 / 415 | Archivos |
| `rate_limited` | 429 | Demasiadas peticiones |
| `payments_disabled` / `not_configured` | 503 | Pagos desactivados / falta configuración |

## Autenticación y cuenta

| Método y ruta | Descripción | Límite |
|---|---|---|
| `POST /api/auth/register` | `{fullName, email, password, confirmPassword, acceptTerms}` → envía correo de confirmación | 5/h por IP |
| `POST /api/auth/login` | `{email, password}` → cookies de sesión httpOnly | 8/5 min por IP y 10/5 min por correo |
| `POST /api/auth/logout` | Cierra la sesión | — |
| `POST /api/auth/forgot-password` | `{email}` → siempre 200 (sin enumeración) | 5/h por IP |
| `POST /api/auth/reset-password` | `{password, confirmPassword}`; solo tras abrir un enlace de recuperación (cookie de 15 min) | 5/h por IP |
| `GET /auth/confirm?token_hash&type&next` | Destino de los enlaces de correo (confirmación, recuperación, cambio de correo) | 20/5 min por IP |
| `PATCH /api/account` | `{fullName}` | — |
| `DELETE /api/account` | `{password, confirmation: "ELIMINAR"}` → borrado definitivo | 10/h por usuario |
| `POST /api/account/password` | `{currentPassword, password, confirmPassword}`; cierra otras sesiones | 10/h por usuario |
| `POST/DELETE /api/account/avatar` | multipart `file` (JPG/PNG/WebP ≤ 2 MB) | 40/min |
| `DELETE /api/account/sessions` | Cierra las demás sesiones | — |
| `POST /api/account/onboarding` | Marca la bienvenida como vista | — |
| `POST /api/account/email` | `{email, password}` → envía enlaces de confirmación; el correo cambia al confirmarlos | 10/h por usuario |
| `PATCH /api/workspace` | `{name}` (propietario/administrador) | — |
| `POST /api/workspace/switch` | `{workspaceId}` → cambia el espacio activo (solo si eres miembro) | — |

## Equipo

| Método y ruta | Descripción |
|---|---|
| `GET /api/team/invitations` | Miembros, invitaciones pendientes y plazas del plan |
| `POST /api/team/invitations` | `{email, role: admin|editor|viewer}` → crea la invitación y devuelve su enlace (propietario/administrador; 10/h) |
| `DELETE /api/team/invitations/{id}` | Anula una invitación |
| `PATCH /api/team/members/{userId}` | `{role}` — solo el propietario gestiona administradores |
| `DELETE /api/team/members/{userId}` | Quita a un miembro o, con tu propio id, abandona el espacio |
| `POST /api/invitations/{token}` | `{action: accept|decline}` — solo la cuenta con el correo invitado |

El espacio activo se guarda en la cookie `ap_workspace`, que el servidor **solo acepta si el usuario es miembro** de ese espacio; en otro caso se usa su espacio propio.

## Catálogo

| Método y ruta | Descripción |
|---|---|
| `GET /api/categories` | Categorías del sistema + personalizadas y sus atributos |
| `POST /api/categories` · `DELETE /api/categories/{id}` | Categorías personalizadas |
| `GET /api/products` | `q, category, condition, archived=active|archived|all, sort, page, pageSize≤100` — paginación en servidor |
| `POST /api/products` | Crea (atributos validados contra la categoría) |
| `GET/PATCH/DELETE /api/products/{id}` | Detalle (con URLs firmadas de 1 h), edición, borrado (incluye archivos) |
| `POST /api/products/{id}/duplicate` | Duplica sin SKU ni fotos |
| `POST /api/products/{id}/images` · `DELETE …/images/{imageId}` | multipart `file`; tipo detectado por contenido; máx. 5 MB |
| `POST /api/products/bulk` | `{action: archive|restore|delete|update, ids[≤200], fields?}` |

## Generación y anuncios

| Método y ruta | Descripción |
|---|---|
| `POST /api/generate` | `{productId, operation: generate|regenerate|tone|shorten|expand|improve_title, options: {platform, templateId, tone, length, language, titleVariant, variation}, idempotencyKey}` → contenido + consumo + datos del medidor de calidad. `variation` cambia la redacción con los mismos datos. No guarda: el anuncio se guarda con `POST /api/listings`. Consume 1 generación (idempotente por clave). |
| `GET /api/listings` | `q, status, platform, product, favorites=1, sort, page, pageSize` |
| `POST /api/listings` | Guarda un anuncio (HTML saneado en servidor) |
| `GET/PATCH/DELETE /api/listings/{id}` | Cada cambio de contenido crea una versión |
| `POST /api/listings/{id}/duplicate` | Copia como borrador |
| `POST /api/listings/{id}/adapt` | `{platform, templateId}` — cambia de plantilla sin consumir generaciones |
| `PUT/DELETE /api/listings/{id}/favorite` | Favorito del usuario |
| `GET /api/listings/{id}/versions` · `POST …/versions {versionNumber}` | Historial y restauración (no borra versiones) |
| `GET /api/listings/export?format=txt|csv|json|shopify_csv&ids&status&platform` | Descarga (formatos según plan; máx. 1000) |
| `GET/POST /api/templates` · `PATCH/DELETE /api/templates/{id}` | Plantillas personalizadas (límite por plan) |

## Generación masiva

| Método y ruta | Descripción |
|---|---|
| `GET /api/imports/template` | Plantilla CSV pública |
| `POST /api/imports` | multipart `file` (.csv ≤ 5 MB, ≤ 60 columnas) → `{importId, headers, suggestedMapping, preview, quota}` |
| `POST /api/imports/validate` | `{importId, mapping, defaults}` → válidas, errores por fila, duplicados |
| `POST /api/jobs` | `{importId, mapping, defaults, filename, options}` → crea el trabajo y reserva consumo |
| `GET /api/jobs` · `GET /api/jobs/{id}` | Listado y detalle (con elementos fallidos) |
| `POST /api/jobs/{id}/process` | Procesa **un lote** (≤ 20) y devuelve el estado; repetir hasta terminar |
| `POST /api/jobs/{id}/retry` | Reintenta fallidos |
| `GET /api/jobs/{id}/export` | CSV con el resultado de cada fila |
| `GET /api/cron/process-jobs` | Solo con `Authorization: Bearer CRON_SECRET`; si no, 404 |

## Facturación

| Método y ruta | Descripción |
|---|---|
| `POST /api/billing/checkout` | `{plan: starter|pro|business}` → URL de Stripe Checkout. 503 con pagos desactivados. |
| `POST /api/billing/portal` | URL del portal de cliente de Stripe |
| `POST /api/stripe/webhook` | Firma verificada con `STRIPE_WEBHOOK_SECRET`; idempotente |

## Administración (solo administradores de plataforma; resto → 404)

| Método y ruta | Descripción |
|---|---|
| `PATCH /api/admin/users/{id}` | `{action: "disable", reason (≥10)}` o `{action: "enable"}` |
| `PATCH /api/admin/workspaces/{id}/plan` | `{planCode, reason}` — no aplica a suscripciones activas de Stripe |
| `PATCH /api/admin/plans/{id}` | Precio informativo y límites |
| `PATCH /api/admin/contact/{id}` | `{handled}` |

## Otros

| Método y ruta | Descripción |
|---|---|
| `GET /api/health` | `{status, config, database}` (200 / 503). Sin datos sensibles. |
| `POST /api/contact` | Formulario de contacto (5/h por IP; campo trampa anti-bots) |
