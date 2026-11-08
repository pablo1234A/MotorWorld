# RevisaYa — API pública v1 (plan Excelencia)

> Implementada en la Fase 9. Código: `src/server/api/` (claves, autenticación, recursos y OpenAPI) y `src/app/api/v1/`. Pruebas: `tests/integration/api.test.ts`.
> Especificación OpenAPI 3.1: `GET /api/v1/openapi.json`.

## 1. Claves
- Las crea un **administrador** en *Configuración → API* (plan Excelencia con la suscripción activa).
- Formato: `ry_live_xxxxxxxx_…` en producción y `ry_test_xxxxxxxx_…` en el resto de entornos.
- La clave completa se muestra **una sola vez**. En la base de datos solo se guarda su HMAC-SHA-256 con `API_KEY_PEPPER`.
- Al crearla se eligen:
  - permisos (*scopes*): `customers:read|write`, `vehicles:read|write`, `maintenance:read|write`, `appointments:read|write`, `reminders:read`;
  - opcionalmente, los talleres (sucursales) que puede ver;
  - una caducidad (30 días, 90 días, 1 año o ninguna).
- Revocar una clave es inmediato. Máximo 20 claves activas por taller.
- **La clave actúa con los permisos del administrador que la creó**, que se comprueban en cada petición:
  - se aplican las mismas reglas que en el panel (RLS, límites del plan, solo lectura sin suscripción);
  - si esa persona deja de ser administradora del taller, la clave deja de funcionar (401) y hay que crear otra;
  - si el plan deja de incluir la API, la respuesta es 403 `plan_feature_unavailable`.
- El taller **nunca** se recibe del cliente: sale de la clave. Un recurso de otro taller, o de un taller que la clave no puede ver, responde **404**.

## 2. Peticiones
```
curl https://<dominio>/api/v1/customers?limit=20 \
  -H "Authorization: Bearer ry_live_abcd1234_…"
```
- JSON en `snake_case`. Fechas de negocio `AAAA-MM-DD`; instantes en ISO 8601 (UTC). Cuerpo máximo: 64 KB.
- **Paginación por cursor**: `?limit=1..100` (50 por defecto) y `?cursor=<next_cursor>`. La respuesta es `{ "object": "list", "data": [...], "next_cursor": "…" | null }`.
- **Idempotency-Key** en `POST` (24 h):
  - repetir la misma petición devuelve la misma respuesta sin repetir el efecto (cabecera `Idempotent-Replayed: true`);
  - la misma clave con otra petición responde 409 `idempotency_conflict`.
- **Límite**: 60 peticiones por minuto por clave (ráfaga de 120) y 120 por minuto por taller. Al pasarlo: 429 `rate_limited` con `Retry-After`.
- Cada respuesta lleva `X-Request-Id`.

## 3. Endpoints
| Método | Ruta | Scope | Notas |
|---|---|---|---|
| GET | `/customers` | customers:read | filtros `email`, `updated_since` |
| POST | `/customers` | customers:write | `branch_id` opcional (por defecto, el taller principal o el único de la clave). Origen `api`. |
| GET / PATCH | `/customers/{id}` | customers:read / write | PATCH cambia solo los campos enviados |
| GET | `/vehicles` | vehicles:read | filtros `plate` (con o sin espacios), `customer_id`, `next_service_before` |
| POST | `/vehicles` | vehicles:write | el vehículo va al taller de su propietario |
| GET / PATCH | `/vehicles/{id}` | vehicles:read / write | PATCH: `plate`, `make`, `model`, `vin`, `status` |
| POST | `/vehicles/{id}/mileage` | vehicles:write | `km`, `read_on`; una lectura menor que la actual exige `confirm_lower: true` |
| GET / POST | `/maintenance` | maintenance:read / write | revisiones con piezas; recalculan la ficha del vehículo y los avisos |
| GET / POST | `/appointments` | appointments:read / write | POST crea una cita **confirmada** (hora local del taller); filtros `status`, `start_from`, `start_to` |
| GET / PATCH | `/appointments/{id}` | appointments:read / write | PATCH `{"action": "confirm", date, time, duration_minutes}` o `reject` / `cancel` / `complete` / `no_show` |
| GET | `/reminders` | reminders:read | filtros `status`, `vehicle_id` |

Las citas creadas o cambiadas por la API también se pasan a Google Calendar si el taller lo tiene conectado. No hay borrados por la API (se hacen desde el panel, con su papelera).

## 4. Errores
```json
{ "error": { "code": "validation_error", "message": "Los datos no son válidos", "fields": { "email": ["Invalid email address"] }, "request_id": "req_…" } }
```
| HTTP | `code` |
|---|---|
| 400 | `validation_error`, `bad_request` |
| 401 | `unauthenticated` |
| 403 | `forbidden` (falta el scope), `plan_feature_unavailable`, `subscription_inactive` |
| 404 | `not_found` (también para recursos de otro taller) |
| 409 | `conflict` (p. ej. matrícula repetida), `idempotency_conflict`, `idempotency_in_progress` |
| 413 / 415 | `payload_too_large` / `unsupported_media_type` |
| 422 | `plan_limit_reached` |
| 429 | `rate_limited` |
| 500 / 503 | `internal_error` / `api_not_configured` |

## 5. Registro
- Cada petición guarda en `api_request_logs` el `request_id`, la clave, la ruta (plantilla, sin parámetros), el estado y la latencia.
- **Nunca** se guardan los cuerpos, las consultas ni la clave.
- Se borran a los 30 días (`private.purge_api_data`, a diario).
- En *Configuración → API* se ven las peticiones y los errores de los últimos 30 días y el último uso de cada clave.

## 6. Fuera de alcance
- Webhooks salientes hacia los sistemas del taller.
- Borrados por la API.
- SDKs.

Si se piden, se proponen como versión posterior (v1 se mantiene compatible; un cambio incompatible sería `v2`).
