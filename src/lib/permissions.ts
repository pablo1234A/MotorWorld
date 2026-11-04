/**
 * Permisos asignables a operarios (misma lista cerrada que el CHECK de
 * `organization_members.permissions`). Los administradores los tienen todos
 * de forma implícita, además de los exclusivos (facturación, usuarios,
 * sucursales, integraciones, API keys, plantillas, configuración, RGPD).
 * Leer clientes, vehículos e historial no requiere permiso (ADR-019).
 */
export const OPERATOR_PERMISSIONS = [
  "customers.write",
  "customers.delete",
  "vehicles.write",
  "vehicles.delete",
  "maintenance.write",
  "imports.run",
  "reminders.read",
  "appointments.manage",
  "quotes.manage",
  "reports.read",
] as const;

export type OperatorPermission = (typeof OPERATOR_PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<OperatorPermission, string> = {
  "customers.write": "Crear y editar clientes",
  "customers.delete": "Borrar clientes",
  "vehicles.write": "Crear y editar vehículos, actualizar kilómetros",
  "vehicles.delete": "Borrar vehículos",
  "maintenance.write": "Registrar revisiones",
  "imports.run": "Importar Excel/CSV",
  "reminders.read": "Ver recordatorios y correos enviados",
  "appointments.manage": "Gestionar citas",
  "quotes.manage": "Gestionar presupuestos",
  "reports.read": "Ver informes",
};

/** Permisos por defecto de un operario nuevo (gestión diaria del taller). */
export const DEFAULT_OPERATOR_PERMISSIONS: readonly OperatorPermission[] = [
  "customers.write",
  "vehicles.write",
  "maintenance.write",
  "reminders.read",
  "appointments.manage",
];

export type Role = "admin" | "operator";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  operator: "Operario",
};

export function isOperatorPermission(value: string): value is OperatorPermission {
  return (OPERATOR_PERMISSIONS as readonly string[]).includes(value);
}
