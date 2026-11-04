import { randomUUID } from "node:crypto";

import { getPool } from "@/server/db/client";

/**
 * Utilidades de datos para tests de integración contra Supabase local.
 * Cada test crea organizaciones con slugs aleatorios: las ejecuciones no se
 * pisan y `pnpm db:reset` deja la base de datos limpia.
 */

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await getPool().query(text, params);
  return res.rows as T[];
}

export function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export async function createUser(email = `${randomUUID()}@test.local`): Promise<string> {
  const id = randomUUID();
  await sql(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data,
                             raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, '',
             '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [id, email],
  );
  return id;
}

export interface TestOrg {
  orgId: string;
  branchId: string;
  ownerId: string;
}

export async function createOrg(plan: string | null = "pro"): Promise<TestOrg> {
  const ownerId = await createUser();
  const [{ id: orgId }] = await sql<{ id: string }>(
    `insert into organizations (slug, trade_name, created_by) values ($1, 'Taller de prueba', $2) returning id`,
    [uniqueSlug("t"), ownerId],
  );
  const [{ id: branchId }] = await sql<{ id: string }>(
    `insert into branches (organization_id, name, slug, is_primary) values ($1, 'Principal', 'principal', true) returning id`,
    [orgId],
  );
  await sql(`insert into organization_members (organization_id, user_id, role, is_owner) values ($1, $2, 'admin', true)`, [
    orgId,
    ownerId,
  ]);
  if (plan) {
    await sql(
      `insert into subscriptions (organization_id, plan_code, status, billing_interval) values ($1, $2, 'active', 'month')`,
      [orgId, plan],
    );
  }
  return { orgId, branchId, ownerId };
}

export async function createCustomers(org: TestOrg, count: number): Promise<void> {
  await sql(
    `insert into customers (organization_id, branch_id, first_name)
     select $1, $2, 'Cliente ' || i from generate_series(1, $3::int) i`,
    [org.orgId, org.branchId, count],
  );
}
