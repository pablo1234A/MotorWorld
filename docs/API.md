# RevisaYa — API pública

> Estado: **diseño (Fase 0)**. Implementación en la Fase 9. Disponible desde el plan **Excelencia**.

## 1. Principios

- Base: `https://<dominio>/api/v1`. Versionado en la ruta; cambios incompatibles → `v2`. Cabecera `RevisaYa-Version` reservada para cambios menores.
- **Autenticación**: `Authorization: Bearer ry_live_…` / `ry_test_…`. La clave se muestra una sola vez; en BD solo su HMAC-SHA-256. Cada clave pertenece a **una** organización: el `organization_id` nunca se recibe del cliente, se deduce de la clave.
- **Scopes**: `customers:read`, `customers:write`, `vehicles:read`, `vehicles:write`, `maintenance:read`, `maintenance:write`, `appointments:read`, `appointments:write`, `reminders:read`. Opcionalmente restringida a sucursales concretas.
- **Rate limiting**: token bucket por clave (propuesta: 60 req/min, ráfaga 120) y por organización; cabeceras `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After` en 429.
- **Validación**: zod en cada endpoint (los mismos esquemas que usa la app). Los límites del plan aplican igual que en el panel.
- **Idempotencia**: `Idempotency-Key` aceptada en `POST` (24 h).
- **Paginación**: por cursor (`?limit=50&cursor=…`), máx. 100.
- **Errores** (formato estable, inspirado en RFC 9457):

```json
{ "error": { "code": "validation_error", "message": "La matrícula no es válida", "fields": { "plate": ["formato_no_valido"] }, "request_id": "req_…" } }
```

| HTTP | `code` |
|---|---|
| 400 | `validation_error`, `bad_request` |
| 401 | `unauthenticated` |
| 403 | `forbidden`, `plan_feature_unavailable` |
| 404 | `not_found` (también para recursos de otra organización: nunca se revela que existen) |
| 409 | `conflict` (p. ej. matrícula duplicada), `idempotency_conflict` |
| 422 | `plan_limit_reached` |
| 429 | `rate_limited` |
| 500 | `internal_error` (sin detalles internos; con `request_id`) |

## 2. Endpoints previstos (v1)

| Método | Ruta | Scope |
|---|---|---|
| GET/POST | `/customers` | customers:read / write |
| GET/PATCH/DELETE | `/customers/{id}` | customers:read / write |
| GET/POST | `/vehicles` (filtro `plate`, `customer_id`, `next_service_before`) | vehicles:* |
| GET/PATCH | `/vehicles/{id}` | vehicles:* |
| GET/POST | `/vehicles/{id}/maintenance` | maintenance:* |
| POST | `/vehicles/{id}/mileage` | vehicles:write |
| GET | `/reminders` | reminders:read |
| GET/POST | `/appointments`, PATCH `/appointments/{id}` | appointments:* |

Documentación OpenAPI 3.1 generada desde los esquemas zod y publicada en `/docs/api` (Fase 9). Webhooks salientes hacia sistemas del taller: fuera del alcance inicial, propuesta para una versión posterior.

## 3. Registro

Cada petición: `request_id`, clave, ruta, estado, latencia (muestreo en `api_request_logs`, 30 días). Errores 5xx a Sentry. Nunca se registran cuerpos con datos personales.
