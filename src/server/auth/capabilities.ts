import "server-only";

import { can, isAdmin, type OrgContext } from "./context";

/**
 * Qué puede hacer el usuario en el taller activo, para decidir qué botones
 * mostrar. Es solo presentación: el servidor y la BD vuelven a comprobarlo.
 * Con la suscripción inactiva todo queda en solo lectura.
 */
export function capabilities(ctx: OrgContext) {
  const active = ctx.subscription.active;
  return {
    readOnly: !active,
    customersWrite: active && can(ctx, "customers.write"),
    customersDelete: active && can(ctx, "customers.delete"),
    vehiclesWrite: active && can(ctx, "vehicles.write"),
    vehiclesDelete: active && can(ctx, "vehicles.delete"),
    maintenanceWrite: active && can(ctx, "maintenance.write"),
    maintenanceDelete: active && isAdmin(ctx),
    // PCI
    installationsWrite: active && can(ctx, "customers.write"),
    installationsDelete: active && can(ctx, "customers.delete"),
    equipmentWrite: active && can(ctx, "vehicles.write"),
    equipmentDelete: active && can(ctx, "vehicles.delete"),
    recordsWrite: active && can(ctx, "maintenance.write"),
    workOrdersManage: active && can(ctx, "work_orders.manage"),
    workOrdersExecute: active && (can(ctx, "work_orders.execute") || can(ctx, "work_orders.manage")),
    incidentsWrite: active && can(ctx, "incidents.write"),
    seeAllWorkOrders: can(ctx, "work_orders.manage"),
    // Documentos y fotos: mismas reglas que la RLS de pci_documents.
    documentsUpload: active && (["customers.write", "vehicles.write", "maintenance.write", "work_orders.execute", "work_orders.manage", "incidents.write"] as const).some((p) => can(ctx, p)),
    documentsDelete: active && (["customers.write", "vehicles.write", "maintenance.write"] as const).some((p) => can(ctx, p)),
  };
}
