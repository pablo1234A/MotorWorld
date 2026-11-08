import { API_SCOPES } from "./keys";

/**
 * Descripción OpenAPI 3.1 de la API v1 (escrita a mano a partir de los
 * esquemas de src/server/api/v1/resources.ts; las pruebas comprueban que cada
 * ruta descrita existe).
 */

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const id = { type: "string", format: "uuid" };
const date = { type: "string", format: "date" };
const dateTime = { type: "string", format: "date-time" };
const nullable = (s: Record<string, unknown>) => ({ anyOf: [s, { type: "null" }] });
const list = (item: string) => ({
  type: "object",
  required: ["object", "data", "next_cursor"],
  properties: { object: { const: "list" }, data: { type: "array", items: ref(item) }, next_cursor: nullable({ type: "string" }) },
});
const paging = [
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
  { name: "cursor", in: "query", schema: { type: "string" }, description: "Valor de next_cursor de la página anterior" },
];
const idParam = { name: "id", in: "path", required: true, schema: id };
const idem = { name: "Idempotency-Key", in: "header", schema: { type: "string", maxLength: 200 }, description: "Repetir la petición con la misma clave (24 h) no repite el efecto" };
const errors = Object.fromEntries(
  [
    ["400", "Datos no válidos (validation_error, bad_request)"],
    ["401", "Clave no válida, caducada o revocada (unauthenticated)"],
    ["403", "Sin el permiso de la clave o plan sin API (forbidden, plan_feature_unavailable)"],
    ["404", "No existe o es de otro taller (not_found)"],
    ["409", "Conflicto (conflict, idempotency_conflict)"],
    ["422", "Límite del plan (plan_limit_reached)"],
    ["429", "Demasiadas peticiones (rate_limited)"],
  ].map(([code, description]) => [code, { description, content: { "application/json": { schema: ref("Error") } } }]),
);
const ok = (schema: Record<string, unknown>, status = "200") => ({ [status]: { description: "OK", content: { "application/json": { schema } } }, ...errors });
const body = (schema: Record<string, unknown>) => ({ required: true, content: { "application/json": { schema } } });
const op = (summary: string, scope: string, extra: Record<string, unknown>) => ({ summary, security: [{ bearer: [scope] }], "x-scope": scope, ...extra });

export function openApiDocument(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "RevisaYa API",
      version: "1.0.0",
      description:
        "API del plan Excelencia. Autenticación: `Authorization: Bearer ry_live_…` (o `ry_test_…` fuera de producción). La clave pertenece a un taller y actúa con los permisos del administrador que la creó. Límite: 60 peticiones/min por clave (ráfaga de 120).",
    },
    servers: [{ url: `${serverUrl.replace(/\/$/, "")}/api/v1` }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: `Permisos: ${API_SCOPES.join(", ")}` } },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              required: ["code", "message", "request_id"],
              properties: { code: { type: "string" }, message: { type: "string" }, fields: { type: "object", additionalProperties: { type: "array", items: { type: "string" } } }, request_id: { type: "string" } },
            },
          },
        },
        Customer: {
          type: "object",
          properties: {
            id, object: { const: "customer" }, branch_id: id, first_name: { type: "string" }, last_name: { type: "string" },
            email: nullable({ type: "string", format: "email" }), phone: nullable({ type: "string", description: "E.164, p. ej. +34600111222" }),
            source: { type: "string" }, notes: nullable({ type: "string" }), reminders_opt_out: { type: "boolean" }, created_at: dateTime, updated_at: dateTime,
          },
        },
        CustomerInput: {
          type: "object",
          required: ["first_name"],
          properties: {
            branch_id: { ...id, description: "Por defecto, el taller principal" }, first_name: { type: "string", maxLength: 80 }, last_name: { type: "string", maxLength: 120 },
            email: nullable({ type: "string", format: "email" }), phone: nullable({ type: "string" }), notes: nullable({ type: "string", maxLength: 5000 }), reminders_opt_out: { type: "boolean" },
          },
        },
        Vehicle: {
          type: "object",
          properties: {
            id, object: { const: "vehicle" }, branch_id: id, customer_id: id, plate: { type: "string" }, make: nullable({ type: "string" }), model: nullable({ type: "string" }),
            vin: nullable({ type: "string" }), status: { enum: ["active", "inactive", "sold", "scrapped"] }, current_km: nullable({ type: "integer" }),
            last_service_date: nullable(date), last_service_km: nullable({ type: "integer" }), next_service_date: nullable(date), next_service_km: nullable({ type: "integer" }),
            created_at: dateTime, updated_at: dateTime,
          },
        },
        VehicleInput: {
          type: "object",
          required: ["customer_id", "plate"],
          properties: {
            customer_id: id, plate: { type: "string" }, make: nullable({ type: "string" }), model: nullable({ type: "string" }), vin: nullable({ type: "string" }),
            current_km: nullable({ type: "integer" }), last_service_date: nullable(date), last_service_km: nullable({ type: "integer" }), next_service_date: nullable(date),
          },
        },
        MaintenanceRecord: {
          type: "object",
          properties: {
            id, object: { const: "maintenance_record" }, branch_id: id, vehicle_id: id, service_date: date, km: nullable({ type: "integer" }), work_performed: { type: "string" },
            notes: nullable({ type: "string" }), next_recommended_date: nullable(date), next_recommended_km: nullable({ type: "integer" }),
            parts: { type: "array", items: { type: "object", properties: { description: { type: "string" }, reference: nullable({ type: "string" }), quantity: { type: "number" } } } },
            created_at: dateTime, updated_at: dateTime,
          },
        },
        Appointment: {
          type: "object",
          properties: {
            id, object: { const: "appointment" }, branch_id: id, customer_id: nullable(id), vehicle_id: nullable(id), source: { type: "string" },
            status: { enum: ["requested", "confirmed", "rejected", "canceled", "completed", "no_show"] },
            requester: { type: "object", properties: { name: { type: "string" }, email: nullable({ type: "string" }), phone: nullable({ type: "string" }), plate: nullable({ type: "string" }) } },
            requested_date: nullable(date), start: nullable(dateTime), end: nullable(dateTime), message: nullable({ type: "string" }), created_at: dateTime, updated_at: dateTime,
          },
        },
        Reminder: {
          type: "object",
          properties: {
            id, object: { const: "reminder" }, branch_id: id, customer_id: id, vehicle_id: id, type: { type: "string" }, status: { type: "string" }, skip_reason: nullable({ type: "string" }),
            due_date: date, offset_days: { type: "integer" }, scheduled_for: dateTime, sent_at: nullable(dateTime), created_at: dateTime,
          },
        },
      },
    },
    paths: {
      "/customers": {
        get: op("Listar clientes", "customers:read", { parameters: [...paging, { name: "email", in: "query", schema: { type: "string" } }, { name: "updated_since", in: "query", schema: dateTime }], responses: ok(list("Customer")) }),
        post: op("Crear un cliente", "customers:write", { parameters: [idem], requestBody: body(ref("CustomerInput")), responses: ok(ref("Customer"), "201") }),
      },
      "/customers/{id}": {
        get: op("Ver un cliente", "customers:read", { parameters: [idParam], responses: ok(ref("Customer")) }),
        patch: op("Cambiar un cliente (solo los campos enviados)", "customers:write", { parameters: [idParam], requestBody: body(ref("CustomerInput")), responses: ok(ref("Customer")) }),
      },
      "/vehicles": {
        get: op("Listar vehículos", "vehicles:read", {
          parameters: [...paging, { name: "plate", in: "query", schema: { type: "string" } }, { name: "customer_id", in: "query", schema: id }, { name: "next_service_before", in: "query", schema: date }],
          responses: ok(list("Vehicle")),
        }),
        post: op("Crear un vehículo", "vehicles:write", { parameters: [idem], requestBody: body(ref("VehicleInput")), responses: ok(ref("Vehicle"), "201") }),
      },
      "/vehicles/{id}": {
        get: op("Ver un vehículo", "vehicles:read", { parameters: [idParam], responses: ok(ref("Vehicle")) }),
        patch: op("Cambiar matrícula, marca, modelo, bastidor o estado", "vehicles:write", {
          parameters: [idParam],
          requestBody: body({ type: "object", properties: { plate: { type: "string" }, make: nullable({ type: "string" }), model: nullable({ type: "string" }), vin: nullable({ type: "string" }), status: { enum: ["active", "inactive", "sold", "scrapped"] } } }),
          responses: ok(ref("Vehicle")),
        }),
      },
      "/vehicles/{id}/mileage": {
        post: op("Anotar una lectura de kilómetros", "vehicles:write", {
          parameters: [idParam, idem],
          requestBody: body({ type: "object", required: ["km"], properties: { km: { type: "integer" }, read_on: date, confirm_lower: { type: "boolean", description: "Necesario si es menor que la actual" } } }),
          responses: ok(ref("Vehicle"), "201"),
        }),
      },
      "/maintenance": {
        get: op("Listar el historial", "maintenance:read", { parameters: [...paging, { name: "vehicle_id", in: "query", schema: id }], responses: ok(list("MaintenanceRecord")) }),
        post: op("Añadir una revisión al historial", "maintenance:write", {
          parameters: [idem],
          requestBody: body({
            type: "object",
            required: ["vehicle_id", "service_date", "work_performed"],
            properties: {
              vehicle_id: id, service_date: date, km: nullable({ type: "integer" }), work_performed: { type: "string" }, notes: nullable({ type: "string" }),
              next_recommended_date: nullable(date), next_recommended_km: nullable({ type: "integer" }),
              parts: { type: "array", maxItems: 50, items: { type: "object", required: ["description", "quantity"], properties: { description: { type: "string" }, reference: nullable({ type: "string" }), quantity: { type: "number" } } } },
            },
          }),
          responses: ok(ref("MaintenanceRecord"), "201"),
        }),
      },
      "/appointments": {
        get: op("Listar citas", "appointments:read", {
          parameters: [...paging, { name: "status", in: "query", schema: { type: "string" } }, { name: "start_from", in: "query", schema: dateTime }, { name: "start_to", in: "query", schema: dateTime }],
          responses: ok(list("Appointment")),
        }),
        post: op("Crear una cita confirmada", "appointments:write", {
          parameters: [idem],
          requestBody: body({
            type: "object",
            required: ["customer_id", "date", "time", "duration_minutes"],
            properties: { customer_id: id, vehicle_id: nullable(id), date, time: { type: "string", pattern: "^\\d{2}:\\d{2}$", description: "Hora local del taller" }, duration_minutes: { type: "integer", minimum: 15, maximum: 480 }, notes: nullable({ type: "string" }) },
          }),
          responses: ok(ref("Appointment"), "201"),
        }),
      },
      "/appointments/{id}": {
        get: op("Ver una cita", "appointments:read", { parameters: [idParam], responses: ok(ref("Appointment")) }),
        patch: op("Confirmar, rechazar, cancelar o cerrar una cita", "appointments:write", {
          parameters: [idParam],
          requestBody: body({
            oneOf: [
              { type: "object", required: ["action", "date", "time", "duration_minutes"], properties: { action: { const: "confirm" }, date, time: { type: "string" }, duration_minutes: { type: "integer" } } },
              { type: "object", required: ["action"], properties: { action: { enum: ["reject", "cancel", "complete", "no_show"] } } },
            ],
          }),
          responses: ok(ref("Appointment")),
        }),
      },
      "/reminders": {
        get: op("Listar avisos", "reminders:read", { parameters: [...paging, { name: "status", in: "query", schema: { type: "string" } }, { name: "vehicle_id", in: "query", schema: id }], responses: ok(list("Reminder")) }),
      },
    },
  };
}
