/**
 * Permisos asignables a operarios (misma lista cerrada que el CHECK de
 * `organization_members.permissions`). Los administradores los tienen todos
 * de forma implícita, además de los exclusivos (facturación, usuarios,
 * sucursales, integraciones, API keys, plantillas, configuración, RGPD).
 * Leer clientes, instalaciones, equipos e historial no requiere permiso (ADR-019).
 * Los códigos «vehicles.*» son heredados y hoy significan EQUIPOS PCI (ADR-079):
 * se conservan para no romper los permisos de las cuentas existentes.
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
  "work_orders.manage",
  "work_orders.execute",
  "incidents.write",
] as const;

export type OperatorPermission = (typeof OPERATOR_PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<OperatorPermission, string> = {
  "customers.write": "Crear y editar clientes e instalaciones",
  "customers.delete": "Borrar clientes e instalaciones",
  "vehicles.write": "Crear y editar equipos PCI",
  "vehicles.delete": "Borrar equipos PCI",
  "maintenance.write": "Registrar actuaciones de mantenimiento",
  "imports.run": "Importar Excel/CSV",
  "reminders.read": "Ver avisos y correos enviados",
  "appointments.manage": "Gestionar solicitudes de visita",
  "quotes.manage": "Gestionar presupuestos",
  "reports.read": "Ver informes",
  "work_orders.manage": "Gestionar órdenes de trabajo (crear, programar, asignar)",
  "work_orders.execute": "Técnico: ejecutar las órdenes asignadas",
  "incidents.write": "Registrar y gestionar incidencias",
};

/** Permisos por defecto de un operario nuevo (gestión diaria de la empresa). */
export const DEFAULT_OPERATOR_PERMISSIONS: readonly OperatorPermission[] = [
  "customers.write",
  "vehicles.write",
  "maintenance.write",
  "reminders.read",
  "appointments.manage",
  "work_orders.execute",
  "incidents.write",
];

export type Role = "admin" | "operator";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  operator: "Técnico / operario",
};

export function isOperatorPermission(value: string): value is OperatorPermission {
  return (OPERATOR_PERMISSIONS as readonly string[]).includes(value);
}
