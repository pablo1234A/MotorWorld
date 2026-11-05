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
  };
}
