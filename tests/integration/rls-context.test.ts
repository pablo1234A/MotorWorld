import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePool, withRls, withSystem } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";

import { createCustomers, createOrg, query, type TestOrg } from "./support/db";

let a: TestOrg;
let b: TestOrg;

beforeAll(async () => {
  a = await createOrg("max");
  b = await createOrg("max");
  await createCustomers(a, 2);
  await createCustomers(b, 3);
});
afterAll(closePool);

describe("withRls: RLS aplicada a las consultas del servidor", () => {
  it("el usuario solo ve los datos de su organización aunque la consulta no filtre", async () => {
    const rows = await withRls({ userId: a.ownerId }, async (tx) => {
      const r = await sql<{ organization_id: string }>`select organization_id from customers`.execute(tx);
      return r.rows;
    });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.organization_id))).toEqual(new Set([a.orgId]));
  });

  it("pedir explícitamente datos de otra organización devuelve vacío", async () => {
    const count = await withRls({ userId: a.ownerId }, async (tx) => {
      const r = await sql<{ n: string }>`select count(*) as n from customers where organization_id = ${b.orgId}`.execute(tx);
      return Number(r.rows[0].n);
    });
    expect(count).toBe(0);
  });

  it("escribir en otra organización lanza permission_denied y revierte", async () => {
    const attempt = withRls({ userId: a.ownerId }, (tx) =>
      tx.insertInto("customers").values({ organization_id: b.orgId, branch_id: b.branchId, first_name: "Intruso" }).execute(),
    );
    await expect(attempt).rejects.toBeInstanceOf(DomainError);
    await expect(attempt).rejects.toMatchObject({ code: "permission_denied" });
    const [{ n }] = await query<{ n: string }>(
      "select count(*) as n from customers where organization_id = $1 and first_name = 'Intruso'",
      [b.orgId],
    );
    expect(Number(n)).toBe(0);
  });

  it("un error a mitad de transacción revierte también lo anterior", async () => {
    await expect(
      withRls({ userId: a.ownerId }, async (tx) => {
        await tx.insertInto("customers").values({ organization_id: a.orgId, branch_id: a.branchId, first_name: "Antes" }).execute();
        await tx.insertInto("customers").values({ organization_id: a.orgId, branch_id: a.branchId, first_name: "" }).execute();
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
    const [{ n }] = await query<{ n: string }>(
      "select count(*) as n from customers where organization_id = $1 and first_name = 'Antes'",
      [a.orgId],
    );
    expect(Number(n)).toBe(0);
  });

  it("el contexto no se filtra a la siguiente transacción de la misma conexión", async () => {
    await withRls({ userId: a.ownerId }, (tx) => sql`select 1`.execute(tx));
    const role = await withSystem(async (tx) => (await sql<{ r: string }>`select current_user as r`.execute(tx)).rows[0].r);
    expect(role).not.toBe("authenticated");
  });

  it("rechaza identificadores de usuario que no son UUID", () => {
    expect(() => withRls({ userId: "' or 1=1 --" }, (tx) => sql`select 1`.execute(tx))).toThrow(/UUID/);
  });
});
