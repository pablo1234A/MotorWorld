import {
  CATEGORY_CODES,
  EQUIPMENT_STATUSES,
  ESTABLISHMENT_TYPES,
  EXTINGUISHER_AGENTS,
  INCIDENT_STATUSES,
  RESULTS,
  SERVICE_TYPES,
  SEVERITIES,
  WORK_ORDER_STATUSES,
} from "@/lib/pci/labels";

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
const nullable = (s: Record<string, unknown>) => ({
  anyOf: [s, { type: "null" }],
});
const list = (item: string) => ({
  type: "object",
  required: ["object", "data", "next_cursor"],
  properties: {
    object: { const: "list" },
    data: { type: "array", items: ref(item) },
    next_cursor: nullable({ type: "string" }),
  },
});
const paging = [
  {
    name: "limit",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
  },
  {
    name: "cursor",
    in: "query",
    schema: { type: "string" },
    description: "Valor de next_cursor de la página anterior",
  },
];
const idParam = { name: "id", in: "path", required: true, schema: id };
const idem = {
  name: "Idempotency-Key",
  in: "header",
  schema: { type: "string", maxLength: 200 },
  description:
    "Repetir la petición con la misma clave (24 h) no repite el efecto",
};
const errors = Object.fromEntries(
  [
    ["400", "Datos no válidos (validation_error, bad_request)"],
    ["401", "Clave no válida, caducada o revocada (unauthenticated)"],
    [
      "403",
      "Sin el permiso de la clave o plan sin API (forbidden, plan_feature_unavailable)",
    ],
    ["404", "No existe o es de otro taller (not_found)"],
    ["409", "Conflicto (conflict, idempotency_conflict)"],
    ["422", "Límite del plan (plan_limit_reached)"],
    ["429", "Demasiadas peticiones (rate_limited)"],
  ].map(([code, description]) => [
    code,
    { description, content: { "application/json": { schema: ref("Error") } } },
  ]),
);
const ok = (schema: Record<string, unknown>, status = "200") => ({
  [status]: { description: "OK", content: { "application/json": { schema } } },
  ...errors,
});
const body = (schema: Record<string, unknown>) => ({
  required: true,
  content: { "application/json": { schema } },
});
const op = (
  summary: string,
  scope: string,
  extra: Record<string, unknown>,
) => ({ summary, security: [{ bearer: [scope] }], "x-scope": scope, ...extra });

const deprecated = { deprecated: true };

export function openApiDocument(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "RevisaYa API",
      version: "1.0.0",
      description:
        "API del plan Excelencia para empresas mantenedoras de protección contra incendios: clientes, instalaciones, equipos PCI, actuaciones, órdenes de trabajo e incidencias. " +
        "Autenticación: `Authorization: Bearer ry_live_…` (o `ry_test_…` fuera de producción). La clave pertenece a una empresa y actúa con los permisos del administrador que la creó. " +
        "Límite: 60 peticiones/min por clave (ráfaga de 120). Las rutas de vehículos (/vehicles, /maintenance) son de la etapa anterior de RevisaYa: siguen funcionando, " +
        "responden con la cabecera `Deprecation` y un `Link` a su sucesora, y se retirarán con aviso previo.",
    },
    servers: [{ url: `${serverUrl.replace(/\/$/, "")}/api/v1` }],
    components: {
      securitySchemes: {
        bearer: {
          type: "http",
          scheme: "bearer",
          description: `Permisos: ${API_SCOPES.join(", ")}`,
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              required: ["code", "message", "request_id"],
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                fields: {
                  type: "object",
                  additionalProperties: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                request_id: { type: "string" },
              },
            },
          },
        },
        Customer: {
          type: "object",
          properties: {
            id,
            object: { const: "customer" },
            branch_id: id,
            first_name: { type: "string" },
            last_name: { type: "string" },
            email: nullable({ type: "string", format: "email" }),
            phone: nullable({
              type: "string",
              description: "E.164, p. ej. +34600111222",
            }),
            source: { type: "string" },
            notes: nullable({ type: "string" }),
            reminders_opt_out: { type: "boolean" },
            customer_kind: { enum: ["company", "individual"] },
            legal_name: nullable({ type: "string" }),
            tax_id: nullable({ type: "string" }),
            address_line1: nullable({ type: "string" }),
            postal_code: nullable({ type: "string" }),
            city: nullable({ type: "string" }),
            province: nullable({ type: "string" }),
            contact_name: nullable({ type: "string" }),
            contact_role: nullable({ type: "string" }),
            created_at: dateTime,
            updated_at: dateTime,
          },
        },
        CustomerInput: {
          type: "object",
          required: ["first_name"],
          properties: {
            branch_id: {
              ...id,
              description: "Por defecto, el taller principal",
            },
            first_name: { type: "string", maxLength: 80 },
            last_name: { type: "string", maxLength: 120 },
            email: nullable({ type: "string", format: "email" }),
            phone: nullable({ type: "string" }),
            notes: nullable({ type: "string", maxLength: 5000 }),
            reminders_opt_out: { type: "boolean" },
            customer_kind: { enum: ["company", "individual"] },
            legal_name: nullable({ type: "string" }),
            tax_id: nullable({
              type: "string",
              description: "NIF/CIF; se valida",
            }),
            address_line1: nullable({ type: "string" }),
            postal_code: nullable({ type: "string" }),
            city: nullable({ type: "string" }),
            province: nullable({ type: "string" }),
            contact_name: nullable({ type: "string" }),
            contact_role: nullable({ type: "string" }),
          },
        },
        Installation: {
          type: "object",
          properties: {
            id,
            object: { const: "installation" },
            branch_id: id,
            customer_id: id,
            name: { type: "string" },
            establishment_type: { enum: [...ESTABLISHMENT_TYPES] },
            address_line1: { type: "string" },
            postal_code: nullable({ type: "string" }),
            city: nullable({ type: "string" }),
            province: nullable({ type: "string" }),
            contact_name: nullable({ type: "string" }),
            contact_phone: nullable({ type: "string" }),
            contact_email: nullable({ type: "string" }),
            notes: nullable({ type: "string" }),
            status: { enum: ["active", "inactive"] },
            next_action_on: nullable(date),
            created_at: dateTime,
            updated_at: dateTime,
          },
        },
        InstallationInput: {
          type: "object",
          required: ["customer_id", "name", "address_line1"],
          properties: {
            customer_id: id,
            name: { type: "string", maxLength: 160 },
            establishment_type: { enum: [...ESTABLISHMENT_TYPES] },
            address_line1: { type: "string", maxLength: 200 },
            postal_code: nullable({ type: "string", pattern: "^[0-9]{5}$" }),
            city: nullable({ type: "string" }),
            province: nullable({ type: "string" }),
            contact_name: nullable({ type: "string" }),
            contact_phone: nullable({ type: "string" }),
            contact_email: nullable({ type: "string", format: "email" }),
            notes: nullable({ type: "string" }),
          },
        },
        Extinguisher: {
          type: "object",
          properties: {
            agent: { enum: [...EXTINGUISHER_AGENTS] },
            charge_value: nullable({ type: "number" }),
            charge_unit: nullable({ enum: ["kg", "l"] }),
            efficacy: nullable({ type: "string" }),
            mobility: { enum: ["portable", "wheeled"] },
            stamped_on: nullable(date),
            put_in_service_on: nullable(date),
            retimbrados_before: { type: "integer", minimum: 0, maximum: 3 },
          },
        },
        Equipment: {
          type: "object",
          properties: {
            id,
            object: { const: "equipment" },
            branch_id: id,
            installation_id: id,
            category: { enum: [...CATEGORY_CODES] },
            type_id: nullable(id),
            code: { type: "string" },
            manufacturer: nullable({ type: "string" }),
            model: nullable({ type: "string" }),
            serial_number: nullable({ type: "string" }),
            location: nullable({ type: "string" }),
            installed_on: nullable(date),
            manufactured_on: nullable(date),
            status: { enum: [...EQUIPMENT_STATUSES] },
            notes: nullable({ type: "string" }),
            last_action_on: nullable(date),
            next_action_on: nullable(date),
            extinguisher: nullable(ref("Extinguisher")),
            created_at: dateTime,
            updated_at: dateTime,
          },
        },
        EquipmentInput: {
          type: "object",
          required: ["installation_id", "category"],
          properties: {
            installation_id: id,
            category: { enum: [...CATEGORY_CODES] },
            type_id: nullable(id),
            code: {
              type: "string",
              description: "Vacío: se asigna uno (EXT-000001…)",
            },
            manufacturer: nullable({ type: "string" }),
            model: nullable({ type: "string" }),
            serial_number: nullable({ type: "string" }),
            location: nullable({ type: "string" }),
            installed_on: nullable(date),
            manufactured_on: nullable(date),
            notes: nullable({ type: "string" }),
            extinguisher: ref("Extinguisher"),
          },
        },
        Action: {
          type: "object",
          properties: {
            id,
            object: { const: "action" },
            branch_id: id,
            equipment_id: id,
            installation_id: id,
            action_type: {
              type: "object",
              properties: {
                id,
                code: { type: "string" },
                name: { type: "string" },
              },
            },
            performed_on: date,
            result: { enum: [...RESULTS] },
            observations: nullable({ type: "string" }),
            next_action_recommended_on: nullable(date),
            technician_id: nullable(id),
            work_order_id: nullable(id),
            amended_at: nullable(dateTime),
            voided_at: nullable(dateTime),
            void_reason: nullable({ type: "string" }),
            created_at: dateTime,
          },
        },
        ActionType: {
          type: "object",
          properties: {
            id,
            object: { const: "action_type" },
            category: nullable({ enum: [...CATEGORY_CODES] }),
            code: { type: "string" },
            name: { type: "string" },
            kind: { type: "string" },
            interval_months: nullable({ type: "integer" }),
            enabled: { type: "boolean" },
            legal_reference: nullable({ type: "string" }),
          },
        },
        WorkOrder: {
          type: "object",
          properties: {
            id,
            object: { const: "work_order" },
            branch_id: id,
            number: { type: "string", example: "OT-2026-0001" },
            status: { enum: [...WORK_ORDER_STATUSES] },
            service_type: { enum: [...SERVICE_TYPES] },
            customer_id: id,
            installation_id: id,
            technician_id: nullable(id),
            scheduled_for: nullable(date),
            scheduled_time: nullable({ type: "string" }),
            description: nullable({ type: "string" }),
            completion_notes: nullable({ type: "string" }),
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id,
                  equipment_id: id,
                  action_type_id: id,
                  status: { enum: ["pending", "done", "not_done"] },
                  result: nullable({ enum: [...RESULTS] }),
                  observations: nullable({ type: "string" }),
                  action_id: nullable(id),
                },
              },
            },
            started_at: nullable(dateTime),
            completed_at: nullable(dateTime),
            canceled_at: nullable(dateTime),
            created_at: dateTime,
          },
        },
        Incident: {
          type: "object",
          properties: {
            id,
            object: { const: "incident" },
            installation_id: id,
            equipment_id: nullable(id),
            work_order_id: nullable(id),
            title: { type: "string" },
            description: nullable({ type: "string" }),
            severity: { enum: [...SEVERITIES] },
            status: { enum: [...INCIDENT_STATUSES] },
            detected_on: date,
            resolved_on: nullable(date),
            resolution: nullable({ type: "string" }),
          },
        },
        Vehicle: {
          type: "object",
          properties: {
            id,
            object: { const: "vehicle" },
            branch_id: id,
            customer_id: id,
            plate: { type: "string" },
            make: nullable({ type: "string" }),
            model: nullable({ type: "string" }),
            vin: nullable({ type: "string" }),
            status: { enum: ["active", "inactive", "sold", "scrapped"] },
            current_km: nullable({ type: "integer" }),
            last_service_date: nullable(date),
            last_service_km: nullable({ type: "integer" }),
            next_service_date: nullable(date),
            next_service_km: nullable({ type: "integer" }),
            created_at: dateTime,
            updated_at: dateTime,
          },
        },
        VehicleInput: {
          type: "object",
          required: ["customer_id", "plate"],
          properties: {
            customer_id: id,
            plate: { type: "string" },
            make: nullable({ type: "string" }),
            model: nullable({ type: "string" }),
            vin: nullable({ type: "string" }),
            current_km: nullable({ type: "integer" }),
            last_service_date: nullable(date),
            last_service_km: nullable({ type: "integer" }),
            next_service_date: nullable(date),
          },
        },
        MaintenanceRecord: {
          type: "object",
          properties: {
            id,
            object: { const: "maintenance_record" },
            branch_id: id,
            vehicle_id: id,
            service_date: date,
            km: nullable({ type: "integer" }),
            work_performed: { type: "string" },
            notes: nullable({ type: "string" }),
            next_recommended_date: nullable(date),
            next_recommended_km: nullable({ type: "integer" }),
            parts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  reference: nullable({ type: "string" }),
                  quantity: { type: "number" },
                },
              },
            },
            created_at: dateTime,
            updated_at: dateTime,
          },
        },
        Appointment: {
          type: "object",
          properties: {
            id,
            object: { const: "appointment" },
            branch_id: id,
            customer_id: nullable(id),
            vehicle_id: nullable(id),
            source: { type: "string" },
            status: {
              enum: [
                "requested",
                "confirmed",
                "rejected",
                "canceled",
                "completed",
                "no_show",
              ],
            },
            requester: {
              type: "object",
              properties: {
                name: { type: "string" },
                email: nullable({ type: "string" }),
                phone: nullable({ type: "string" }),
                plate: nullable({ type: "string" }),
              },
            },
            requested_date: nullable(date),
            start: nullable(dateTime),
            end: nullable(dateTime),
            message: nullable({ type: "string" }),
            created_at: dateTime,
            updated_at: dateTime,
          },
        },
        Reminder: {
          type: "object",
          properties: {
            id,
            object: { const: "reminder" },
            branch_id: id,
            customer_id: id,
            vehicle_id: id,
            type: { type: "string" },
            status: { type: "string" },
            skip_reason: nullable({ type: "string" }),
            due_date: date,
            offset_days: { type: "integer" },
            scheduled_for: dateTime,
            sent_at: nullable(dateTime),
            created_at: dateTime,
          },
        },
      },
    },
    paths: {
      "/customers": {
        get: op("Listar clientes", "customers:read", {
          parameters: [
            ...paging,
            { name: "email", in: "query", schema: { type: "string" } },
            { name: "updated_since", in: "query", schema: dateTime },
          ],
          responses: ok(list("Customer")),
        }),
        post: op("Crear un cliente", "customers:write", {
          parameters: [idem],
          requestBody: body(ref("CustomerInput")),
          responses: ok(ref("Customer"), "201"),
        }),
      },
      "/customers/{id}": {
        get: op("Ver un cliente", "customers:read", {
          parameters: [idParam],
          responses: ok(ref("Customer")),
        }),
        patch: op(
          "Cambiar un cliente (solo los campos enviados)",
          "customers:write",
          {
            parameters: [idParam],
            requestBody: body(ref("CustomerInput")),
            responses: ok(ref("Customer")),
          },
        ),
      },
      "/installations": {
        get: op("Listar instalaciones", "installations:read", {
          parameters: [
            ...paging,
            { name: "customer_id", in: "query", schema: id },
            {
              name: "status",
              in: "query",
              schema: { enum: ["active", "inactive"] },
            },
          ],
          responses: ok(list("Installation")),
        }),
        post: op("Crear una instalación", "installations:write", {
          parameters: [idem],
          requestBody: body(ref("InstallationInput")),
          responses: ok(ref("Installation"), "201"),
        }),
      },
      "/installations/{id}": {
        get: op("Ver una instalación", "installations:read", {
          parameters: [idParam],
          responses: ok(ref("Installation")),
        }),
        patch: op(
          "Cambiar una instalación (solo los campos enviados; status para activarla o desactivarla)",
          "installations:write",
          {
            parameters: [idParam],
            requestBody: body(ref("InstallationInput")),
            responses: ok(ref("Installation")),
          },
        ),
      },
      "/equipment": {
        get: op("Listar equipos PCI", "equipment:read", {
          parameters: [
            ...paging,
            { name: "installation_id", in: "query", schema: id },
            {
              name: "category",
              in: "query",
              schema: { enum: [...CATEGORY_CODES] },
            },
            {
              name: "status",
              in: "query",
              schema: { enum: [...EQUIPMENT_STATUSES] },
            },
            { name: "due_before", in: "query", schema: date },
          ],
          responses: ok(list("Equipment")),
        }),
        post: op(
          "Dar de alta un equipo (cuenta en el límite del plan)",
          "equipment:write",
          {
            parameters: [idem],
            requestBody: body(ref("EquipmentInput")),
            responses: ok(ref("Equipment"), "201"),
          },
        ),
      },
      "/equipment/{id}": {
        get: op("Ver un equipo", "equipment:read", {
          parameters: [idParam],
          responses: ok(ref("Equipment")),
        }),
        patch: op(
          "Cambiar un equipo (la categoría no se cambia)",
          "equipment:write",
          {
            parameters: [idParam],
            requestBody: body(ref("EquipmentInput")),
            responses: ok(ref("Equipment")),
          },
        ),
      },
      "/action-types": {
        get: op(
          "Operaciones de mantenimiento (catálogo RIPCI y propias)",
          "equipment:read",
          { responses: ok(list("ActionType")) },
        ),
      },
      "/actions": {
        get: op("Listar actuaciones", "maintenance:read", {
          parameters: [
            ...paging,
            { name: "equipment_id", in: "query", schema: id },
            { name: "installation_id", in: "query", schema: id },
            { name: "from", in: "query", schema: date },
          ],
          responses: ok(list("Action")),
        }),
        post: op(
          "Registrar una actuación (no se puede borrar: se corrige o se anula desde el panel)",
          "maintenance:write",
          {
            parameters: [idem],
            requestBody: body({
              type: "object",
              required: [
                "equipment_id",
                "action_type_id",
                "performed_on",
                "result",
              ],
              properties: {
                equipment_id: id,
                action_type_id: id,
                performed_on: date,
                result: { enum: [...RESULTS] },
                observations: nullable({ type: "string" }),
                next_action_recommended_on: nullable(date),
                technician_id: nullable(id),
                materials: {
                  type: "array",
                  maxItems: 50,
                  items: {
                    type: "object",
                    required: ["description"],
                    properties: {
                      description: { type: "string" },
                      reference: nullable({ type: "string" }),
                      quantity: { type: "number" },
                      unit: nullable({ type: "string" }),
                    },
                  },
                },
              },
            }),
            responses: ok(ref("Action"), "201"),
          },
        ),
      },
      "/work-orders": {
        get: op("Listar órdenes de trabajo", "work_orders:read", {
          parameters: [
            ...paging,
            {
              name: "status",
              in: "query",
              schema: { enum: [...WORK_ORDER_STATUSES] },
            },
            { name: "installation_id", in: "query", schema: id },
          ],
          responses: ok(list("WorkOrder")),
        }),
        post: op("Crear una orden de trabajo", "work_orders:write", {
          parameters: [idem],
          requestBody: body({
            type: "object",
            required: ["installation_id", "service_type"],
            properties: {
              installation_id: id,
              service_type: { enum: [...SERVICE_TYPES] },
              scheduled_for: nullable(date),
              scheduled_time: nullable({
                type: "string",
                pattern: "^\\d{2}:\\d{2}$",
              }),
              technician_id: nullable(id),
              description: nullable({ type: "string" }),
              items: {
                type: "array",
                maxItems: 500,
                items: {
                  type: "object",
                  required: ["equipment_id", "action_type_id"],
                  properties: { equipment_id: id, action_type_id: id },
                },
              },
            },
          }),
          responses: ok(ref("WorkOrder"), "201"),
        }),
      },
      "/work-orders/{id}": {
        get: op(
          "Ver una orden de trabajo con sus equipos",
          "work_orders:read",
          { parameters: [idParam], responses: ok(ref("WorkOrder")) },
        ),
      },
      "/work-orders/{id}/status": {
        post: op(
          "Cambiar el estado de una orden (completed exige resultado en todos los equipos)",
          "work_orders:write",
          {
            parameters: [idParam],
            requestBody: body({
              type: "object",
              required: ["status"],
              properties: {
                status: { enum: [...WORK_ORDER_STATUSES] },
                completion_notes: nullable({ type: "string" }),
              },
            }),
            responses: ok(ref("WorkOrder")),
          },
        ),
      },
      "/incidents": {
        get: op("Listar incidencias", "incidents:read", {
          parameters: [
            ...paging,
            {
              name: "status",
              in: "query",
              schema: { enum: [...INCIDENT_STATUSES] },
            },
            { name: "installation_id", in: "query", schema: id },
          ],
          responses: ok(list("Incident")),
        }),
        post: op("Registrar una incidencia", "incidents:write", {
          parameters: [idem],
          requestBody: body({
            type: "object",
            required: ["installation_id", "severity", "title"],
            properties: {
              installation_id: id,
              equipment_id: nullable(id),
              work_order_id: nullable(id),
              severity: { enum: [...SEVERITIES] },
              title: { type: "string" },
              description: nullable({ type: "string" }),
              detected_on: date,
            },
          }),
          responses: ok(ref("Incident"), "201"),
        }),
      },
      "/incidents/{id}": {
        get: op("Ver una incidencia", "incidents:read", {
          parameters: [idParam],
          responses: ok(ref("Incident")),
        }),
        patch: op(
          "Cambiar el estado, la gravedad o la resolución",
          "incidents:write",
          {
            parameters: [idParam],
            requestBody: body({
              type: "object",
              properties: {
                status: { enum: [...INCIDENT_STATUSES] },
                severity: { enum: [...SEVERITIES] },
                resolution: nullable({ type: "string" }),
              },
            }),
            responses: ok(ref("Incident")),
          },
        ),
      },
      "/vehicles": {
        get: op("Listar vehículos", "vehicles:read", {
          ...deprecated,
          parameters: [
            ...paging,
            { name: "plate", in: "query", schema: { type: "string" } },
            { name: "customer_id", in: "query", schema: id },
            { name: "next_service_before", in: "query", schema: date },
          ],
          responses: ok(list("Vehicle")),
        }),
        post: op("Crear un vehículo", "vehicles:write", {
          ...deprecated,
          parameters: [idem],
          requestBody: body(ref("VehicleInput")),
          responses: ok(ref("Vehicle"), "201"),
        }),
      },
      "/vehicles/{id}": {
        get: op("Ver un vehículo", "vehicles:read", {
          ...deprecated,
          parameters: [idParam],
          responses: ok(ref("Vehicle")),
        }),
        patch: op(
          "Cambiar matrícula, marca, modelo, bastidor o estado",
          "vehicles:write",
          {
            ...deprecated,
            parameters: [idParam],
            requestBody: body({
              type: "object",
              properties: {
                plate: { type: "string" },
                make: nullable({ type: "string" }),
                model: nullable({ type: "string" }),
                vin: nullable({ type: "string" }),
                status: { enum: ["active", "inactive", "sold", "scrapped"] },
              },
            }),
            responses: ok(ref("Vehicle")),
          },
        ),
      },
      "/vehicles/{id}/mileage": {
        post: op("Anotar una lectura de kilómetros", "vehicles:write", {
          ...deprecated,
          parameters: [idParam, idem],
          requestBody: body({
            type: "object",
            required: ["km"],
            properties: {
              km: { type: "integer" },
              read_on: date,
              confirm_lower: {
                type: "boolean",
                description: "Necesario si es menor que la actual",
              },
            },
          }),
          responses: ok(ref("Vehicle"), "201"),
        }),
      },
      "/maintenance": {
        get: op(
          "Listar el historial de vehículos (obsoleto: usa /actions)",
          "maintenance:read",
          {
            ...deprecated,
            parameters: [
              ...paging,
              { name: "vehicle_id", in: "query", schema: id },
            ],
            responses: ok(list("MaintenanceRecord")),
          },
        ),
        post: op(
          "Añadir una revisión de vehículo (obsoleto: usa /actions)",
          "maintenance:write",
          {
            ...deprecated,
            parameters: [idem],
            requestBody: body({
              type: "object",
              required: ["vehicle_id", "service_date", "work_performed"],
              properties: {
                vehicle_id: id,
                service_date: date,
                km: nullable({ type: "integer" }),
                work_performed: { type: "string" },
                notes: nullable({ type: "string" }),
                next_recommended_date: nullable(date),
                next_recommended_km: nullable({ type: "integer" }),
                parts: {
                  type: "array",
                  maxItems: 50,
                  items: {
                    type: "object",
                    required: ["description", "quantity"],
                    properties: {
                      description: { type: "string" },
                      reference: nullable({ type: "string" }),
                      quantity: { type: "number" },
                    },
                  },
                },
              },
            }),
            responses: ok(ref("MaintenanceRecord"), "201"),
          },
        ),
      },
      "/appointments": {
        get: op("Listar citas", "appointments:read", {
          parameters: [
            ...paging,
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "start_from", in: "query", schema: dateTime },
            { name: "start_to", in: "query", schema: dateTime },
          ],
          responses: ok(list("Appointment")),
        }),
        post: op("Crear una cita confirmada", "appointments:write", {
          parameters: [idem],
          requestBody: body({
            type: "object",
            required: ["customer_id", "date", "time", "duration_minutes"],
            properties: {
              customer_id: id,
              vehicle_id: nullable(id),
              date,
              time: {
                type: "string",
                pattern: "^\\d{2}:\\d{2}$",
                description: "Hora local del taller",
              },
              duration_minutes: { type: "integer", minimum: 15, maximum: 480 },
              notes: nullable({ type: "string" }),
            },
          }),
          responses: ok(ref("Appointment"), "201"),
        }),
      },
      "/appointments/{id}": {
        get: op("Ver una cita", "appointments:read", {
          parameters: [idParam],
          responses: ok(ref("Appointment")),
        }),
        patch: op(
          "Confirmar, rechazar, cancelar o cerrar una cita",
          "appointments:write",
          {
            parameters: [idParam],
            requestBody: body({
              oneOf: [
                {
                  type: "object",
                  required: ["action", "date", "time", "duration_minutes"],
                  properties: {
                    action: { const: "confirm" },
                    date,
                    time: { type: "string" },
                    duration_minutes: { type: "integer" },
                  },
                },
                {
                  type: "object",
                  required: ["action"],
                  properties: {
                    action: {
                      enum: ["reject", "cancel", "complete", "no_show"],
                    },
                  },
                },
              ],
            }),
            responses: ok(ref("Appointment")),
          },
        ),
      },
      "/reminders": {
        get: op("Listar avisos", "reminders:read", {
          parameters: [
            ...paging,
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "vehicle_id", in: "query", schema: id },
          ],
          responses: ok(list("Reminder")),
        }),
      },
    },
  };
}
