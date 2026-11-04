import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePool, withRls, withSystem } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";

import { createCustomers, createOrg, sql, type TestOrg } from "./support/db";

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
      const r = await tx.query<{ organization_id: string }>("select organization_id from customers");
      return r.rows;
    });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.organization_id))).toEqual(new Set([a.orgId]));
  });

  it("pedir explícitamente datos de otra organización devuelve vacío", async () => {
    const count = await withRls({ userId: a.ownerId }, async (tx) => {
      const r = await tx.query<{ n: string }>("select count(*) as n from customers where organization_id = $1", [b.orgId]);
      return Number(r.rows[0].n);
    });
    expect(count).toBe(0);
  });

  it("escribir en otra organización lanza permission_denied y revierte", async () => {
    const attempt = withRls({ userId: a.ownerId }, (tx) =>
      tx.query("insert into customers (organization_id, branch_id, first_name) values ($1, $2, 'Intruso')", [
        b.orgId,
        b.branchId,
      ]),
    );
    await expect(attempt).rejects.toBeInstanceOf(DomainError);
    await expect(attempt).rejects.toMatchObject({ code: "permission_denied" });
    const [{ n }] = await sql<{ n: string }>(
      "select count(*) as n from customers where organization_id = $1 and first_name = 'Intruso'",
      [b.orgId],
    );
    expect(Number(n)).toBe(0);
  });

  it("un error a mitad de transacción revierte también lo anterior", async () => {
    await expect(
      withRls({ userId: a.ownerId }, async (tx) => {
        await tx.query("insert into customers (organization_id, branch_id, first_name) values ($1, $2, 'Antes')", [
          a.orgId,
          a.branchId,
        ]);
        await tx.query("insert into customers (organization_id, branch_id, first_name) values ($1, $2, '')", [
          a.orgId,
          a.branchId,
        ]);
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
    const [{ n }] = await sql<{ n: string }>(
      "select count(*) as n from customers where organization_id = $1 and first_name = 'Antes'",
      [a.orgId],
    );
    expect(Number(n)).toBe(0);
  });

  it("el contexto no se filtra a la siguiente transacción de la misma conexión", async () => {
    await withRls({ userId: a.ownerId }, (tx) => tx.query("select 1"));
    const role = await withSystem(async (tx) => (await tx.query<{ r: string }>("select current_user as r")).rows[0].r);
    expect(role).not.toBe("authenticated");
  });

  it("rechaza identificadores de usuario que no son UUID", () => {
    expect(() => withRls({ userId: "' or 1=1 --" }, (tx) => tx.query("select 1"))).toThrow(/UUID/);
  });
});
