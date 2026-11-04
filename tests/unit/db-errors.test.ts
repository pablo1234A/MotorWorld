import { describe, expect, it } from "vitest";

import { DomainError, mapDatabaseError } from "@/server/db/errors";

describe("mapDatabaseError", () => {
  it("traduce los códigos propios de límites y planes", () => {
    const e = mapDatabaseError({ code: "RY001", message: "plan_limit_reached", detail: "customers" });
    expect(e).toBeInstanceOf(DomainError);
    expect(e.code).toBe("plan_limit_reached");
    expect(e.detail).toBe("customers");
    expect(e.status).toBe(422);
    expect(mapDatabaseError({ code: "RY002", message: "subscription_inactive" }).code).toBe("subscription_inactive");
    expect(mapDatabaseError({ code: "RY003", message: "feature_unavailable", detail: "api" }).detail).toBe("api");
  });

  it("RLS y privilegios → permission_denied", () => {
    const e = mapDatabaseError({ code: "42501", message: 'new row violates row-level security policy for table "customers"' });
    expect(e.code).toBe("permission_denied");
    expect(e.detail).toBeUndefined();
    expect(mapDatabaseError({ code: "42501", message: "owner_protected" }).detail).toBe("owner_protected");
  });

  it("unicidad e integridad", () => {
    expect(mapDatabaseError({ code: "23505", message: "dup", constraint: "vehicles_plate_unique" })).toMatchObject({
      code: "conflict",
      detail: "vehicles_plate_unique",
    });
    expect(mapDatabaseError({ code: "23503", message: "customer_has_vehicles" }).detail).toBe("customer_has_vehicles");
  });

  it("no filtra mensajes internos desconocidos", () => {
    const e = mapDatabaseError({ code: "XX000", message: "detalle interno con datos" });
    expect(e.code).toBe("internal_error");
    expect(e.detail).toBeUndefined();
    expect(mapDatabaseError(new Error("boom")).code).toBe("internal_error");
  });
});
